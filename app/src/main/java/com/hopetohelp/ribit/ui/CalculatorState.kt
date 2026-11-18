package com.hopetohelp.ribit.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.hopetohelp.ribit.data.CalculationStore
import com.hopetohelp.ribit.data.SavedSummary
import com.hopetohelp.ribit.domain.Calculation
import com.hopetohelp.ribit.domain.Calculator
import com.hopetohelp.ribit.domain.CurrencyCode
import com.hopetohelp.ribit.domain.Frequency
import com.hopetohelp.ribit.domain.Plan
import com.hopetohelp.ribit.domain.Timing
import com.hopetohelp.ribit.domain.maxDuration
import com.hopetohelp.ribit.domain.maxInvestment
import com.hopetohelp.ribit.domain.maxRate
import com.hopetohelp.ribit.domain.minRate
import java.math.BigDecimal
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

enum class Destination(val title: String) {
    CALCULATE("מחשבון"), COMPARE("השוואה"), SAVED("שמורים"),
}

enum class Field { INITIAL, DEPOSIT, RATE, YEARS, MONTHS }

data class PlanDraft(
    val initial: String = "",
    val deposit: String = "",
    val annualRate: String = "",
    val years: String = "",
    val months: String = "",
    val frequency: Frequency = Frequency.NONE,
    val timing: Timing = Timing.END,
) {
    fun validate(): Pair<Plan?, Map<Field, String>> {
        val errors = mutableMapOf<Field, String>()
        val initialAmount = amount(initial, Field.INITIAL, errors)
        val depositAmount = if (frequency == Frequency.NONE) {
            BigDecimal.ZERO
        } else {
            amount(deposit, Field.DEPOSIT, errors)
        }

        val rate = parseDecimal(annualRate)
        if (rate == null || rate <= minRate || rate > maxRate || rate.scale() > 4) {
            errors[Field.RATE] = "הזינו אחוז מעל ‎-100 ועד 1,000"
        }

        val wholeYears = wholeNumber(years)
        val extraMonths = wholeNumber(months)
        if (wholeYears == null || wholeYears !in 0..100) {
            errors[Field.YEARS] = "בין 0 ל־100"
        }
        if (extraMonths == null || extraMonths !in 0..11) {
            errors[Field.MONTHS] = "בין 0 ל־11"
        }
        val duration = (wholeYears ?: 0) * 12 + (extraMonths ?: 0)
        if (Field.YEARS !in errors && Field.MONTHS !in errors && duration !in 1..maxDuration) {
            errors[Field.YEARS] = "מחודש אחד עד 100 שנים"
        }

        if (errors.isNotEmpty()) return null to errors
        return Plan(
            initialAmount ?: BigDecimal.ZERO,
            depositAmount ?: BigDecimal.ZERO,
            requireNotNull(rate),
            duration,
            frequency,
            timing,
        ) to emptyMap()
    }

    private fun amount(
        value: String,
        field: Field,
        errors: MutableMap<Field, String>,
    ): BigDecimal? {
        if (value.isBlank()) return BigDecimal.ZERO
        val amount = parseDecimal(value, allowGrouping = true)
        if (amount == null || amount !in BigDecimal.ZERO..maxInvestment || amount.scale() > 2) {
            errors[field] = "הזינו סכום חיובי, עד שתי ספרות אחרי הנקודה"
        }
        return amount
    }

    companion object {
        fun from(plan: Plan) = PlanDraft(
            initial = plan.initial.toPlainString(),
            deposit = plan.deposit.takeIf { plan.frequency != Frequency.NONE }?.toPlainString().orEmpty(),
            annualRate = plan.annualRate.toPlainString(),
            years = (plan.months / 12).toString(),
            months = (plan.months % 12).toString(),
            frequency = plan.frequency,
            timing = plan.timing,
        )
    }
}

private val decimalInput = Regex("[+-]?(?:[0-9]+(?:[.,][0-9]*)?|[.,][0-9]+)")
private val groupedDecimalInput = Regex("[+-]?[1-9][0-9]{0,2}(?:,[0-9]{3})+(?:\\.[0-9]+)?")

private fun parseDecimal(input: String, allowGrouping: Boolean = false): BigDecimal? {
    val text = normalizeDigits(input.trim()).replace('−', '-')
    val normalized = when {
        allowGrouping && groupedDecimalInput.matches(text) -> text.replace(",", "")
        decimalInput.matches(text) -> text.replace(',', '.')
        else -> return null
    }
    return normalized.toBigDecimalOrNull()?.stripTrailingZeros()
}

private fun wholeNumber(input: String): Int? {
    val text = normalizeDigits(input.trim())
    if (text.isEmpty()) return 0
    if (text.any { it !in '0'..'9' }) return null
    return text.toIntOrNull()
}

private fun normalizeDigits(input: String): String = buildString {
    for (character in input) {
        when {
            character.isDigit() -> append(character.digitToInt())
            character == '٫' -> append('.')
            character == '٬' -> append(',')
            else -> append(character)
        }
    }
}

data class Session(
    val drafts: List<PlanDraft>,
    val currency: CurrencyCode = CurrencyCode.ILS,
    val calculation: Calculation? = null,
    val errors: List<Map<Field, String>> = emptyList(),
    val entryId: String? = null,
    val title: String? = null,
    val showingResult: Boolean = false,
) {
    companion object {
        fun empty(count: Int) = Session(List(count) { PlanDraft() })
    }
}

class CalculatorViewModel(application: Application) : AndroidViewModel(application) {
    private val store = CalculationStore(application)
    val saved = store.summaries
    var destination by mutableStateOf(Destination.CALCULATE)
        private set
    var single by mutableStateOf(Session.empty(1))
        private set
    var compare by mutableStateOf(Session.empty(2))
        private set
    var busy by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set

    val session: Session get() = if (destination == Destination.COMPARE) compare else single

    fun navigate(target: Destination) {
        destination = target
    }

    fun changeDraft(index: Int, draft: PlanDraft) {
        val current = session
        val errors = current.errors.mapIndexed { position, values ->
            if (position == index) emptyMap() else values
        }
        update(current.copy(
            drafts = current.drafts.mapIndexed { position, old -> if (position == index) draft else old },
            calculation = null,
            errors = errors,
            showingResult = false,
        ))
    }

    fun changeCurrency(currency: CurrencyCode) {
        update(session.copy(currency = currency, calculation = null, showingResult = false))
    }

    fun calculate() {
        val current = session
        val validated = current.drafts.map(PlanDraft::validate)
        val plans = validated.mapNotNull { it.first }
        if (plans.size != current.drafts.size) {
            update(current.copy(errors = validated.map { it.second }))
            return
        }
        update(current.copy(
            calculation = Calculator.calculate(current.currency, plans),
            errors = emptyList(),
            showingResult = true,
        ))
    }

    fun edit() {
        update(session.copy(showingResult = false))
    }

    fun reset() {
        update(Session.empty(session.drafts.size).copy(currency = session.currency))
    }

    fun save(title: String, asNew: Boolean, onSaved: () -> Unit) {
        val target = destination
        val current = session
        val calculation = current.calculation ?: return
        if (title.isBlank()) return
        runStorage("השמירה נכשלה. אפשר לנסות שוב.") {
            val name = title.trim()
            val id = store.save(current.entryId.takeUnless { asNew }, name, calculation)
            val active = if (target == Destination.COMPARE) compare else single
            if (active === current) setSession(target, active.copy(entryId = id, title = name))
            message = "החישוב נשמר במכשיר"
            onSaved()
        }
    }

    fun open(entry: SavedSummary) {
        runStorage("לא ניתן לפתוח את החישוב.") {
            val (title, calculation) = store.load(entry.id)
                ?: error("Saved calculation was removed")
            val target = if (calculation.plans.size == 2) Destination.COMPARE else Destination.CALCULATE
            setSession(
                target,
                Session(
                    drafts = calculation.plans.map(PlanDraft::from),
                    currency = calculation.currency,
                    calculation = calculation,
                    entryId = entry.id,
                    title = title,
                    showingResult = true,
                ),
            )
            navigate(target)
        }
    }

    fun remove(entry: SavedSummary, onRemoved: () -> Unit) {
        runStorage("המחיקה נכשלה. אפשר לנסות שוב.") {
            store.remove(entry.id)
            if (single.entryId == entry.id) single = single.copy(entryId = null, title = null)
            if (compare.entryId == entry.id) compare = compare.copy(entryId = null, title = null)
            message = "החישוב נמחק"
            onRemoved()
        }
    }

    fun clearMessage() {
        message = null
    }

    private fun update(value: Session) = setSession(destination, value)

    private fun setSession(target: Destination, value: Session) {
        when (target) {
            Destination.CALCULATE -> single = value
            Destination.COMPARE -> compare = value
            Destination.SAVED -> error("Saved list has no draft")
        }
    }

    private fun runStorage(errorMessage: String, block: suspend () -> Unit) {
        if (busy) return
        busy = true
        viewModelScope.launch {
            try {
                block()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                message = errorMessage
            } finally {
                busy = false
            }
        }
    }
}
