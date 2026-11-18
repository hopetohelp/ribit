package com.hopetohelp.ribit.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import com.hopetohelp.ribit.domain.CurrencyCode
import com.hopetohelp.ribit.domain.Frequency
import com.hopetohelp.ribit.domain.Timing

internal val CurrencyCode.symbol: String
    get() = when (this) {
        CurrencyCode.ILS -> "₪"
        CurrencyCode.USD -> "$"
        CurrencyCode.EUR -> "€"
        CurrencyCode.GBP -> "£"
    }

private val CurrencyCode.title: String
    get() = when (this) {
        CurrencyCode.ILS -> "שקל ישראלי"
        CurrencyCode.USD -> "דולר אמריקאי"
        CurrencyCode.EUR -> "אירו"
        CurrencyCode.GBP -> "לירה שטרלינג"
    }

@Composable
internal fun CurrencyChooser(current: CurrencyCode, onSelect: (CurrencyCode) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("מטבע", style = MaterialTheme.typography.titleMedium)
        Box {
            OutlinedButton(
                onClick = { expanded = true },
                modifier = Modifier.focusRing().semantics {
                    contentDescription = "בחירת מטבע, ${current.title}"
                },
            ) {
                Text("${current.symbol}  ${current.name}", style = MaterialTheme.typography.labelLarge)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                CurrencyCode.entries.forEach { currency ->
                    DropdownMenuItem(
                        text = { Text("${currency.title}  ${currency.symbol}") },
                        onClick = {
                            expanded = false
                            onSelect(currency)
                        },
                        modifier = Modifier.focusRing(4),
                    )
                }
            }
        }
    }
}

@Composable
internal fun PlanEditor(
    draft: PlanDraft,
    currency: CurrencyCode,
    errors: Map<Field, String>,
    advanced: Boolean,
    onToggleAdvanced: () -> Unit,
    onCurrencyChange: (CurrencyCode) -> Unit,
    onChange: (PlanDraft) -> Unit,
) {
    val advancedSection = remember { BringIntoViewRequester() }
    LaunchedEffect(advanced) {
        if (advanced) {
            withFrameNanos { }
            advancedSection.bringIntoView()
        }
    }

    OutlinedCard(
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, Border),
    ) {
        Column(
            Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            NumberField(
                draft.initial, { onChange(draft.copy(initial = it)) },
                "סכום התחלתי", errors[Field.INITIAL], suffix = currency.symbol,
            )

            Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text("הפקדה חוזרת", style = MaterialTheme.typography.titleMedium)
                ChoiceGroup(
                    Frequency.entries, draft.frequency,
                    label = {
                        when (it) {
                            Frequency.NONE -> "ללא"
                            Frequency.MONTHLY -> "חודשית"
                            Frequency.YEARLY -> "שנתית"
                        }
                    },
                    onSelect = { onChange(draft.copy(frequency = it)) },
                )
            }
            if (draft.frequency != Frequency.NONE) {
                NumberField(
                    draft.deposit, { onChange(draft.copy(deposit = it)) },
                    "סכום להפקדה", errors[Field.DEPOSIT], suffix = currency.symbol,
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    NumberField(
                        draft.annualRate, { onChange(draft.copy(annualRate = it)) },
                        "ריבית שנתית", errors[Field.RATE], suffix = "%",
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedButton(
                        onClick = {
                            val rate = draft.annualRate
                            val next = when {
                                rate.startsWith("-") || rate.startsWith("−") -> rate.drop(1)
                                rate.startsWith("+") -> "-" + rate.drop(1)
                                else -> "-$rate"
                            }
                            onChange(draft.copy(annualRate = next))
                        },
                        modifier = Modifier.padding(top = 8.dp).widthIn(min = 48.dp)
                            .heightIn(min = 48.dp).focusRing().semantics {
                                contentDescription = "החלפת סימן הריבית"
                            },
                    ) {
                        Text("±")
                    }
                }
                if (errors[Field.RATE] == null) {
                    Text(
                        "ריבית אפקטיבית לשנה שלמה",
                        style = MaterialTheme.typography.bodySmall,
                        color = Muted,
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("משך ההשקעה", style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    NumberField(
                        draft.years, { onChange(draft.copy(years = it)) },
                        "שנים", errors[Field.YEARS], whole = true,
                        modifier = Modifier.weight(1f),
                    )
                    NumberField(
                        draft.months, { onChange(draft.copy(months = it)) },
                        "חודשים", errors[Field.MONTHS], whole = true,
                        modifier = Modifier.weight(1f), imeAction = ImeAction.Done,
                    )
                }
            }

            HorizontalDivider(color = Border)
            Column(
                Modifier.bringIntoViewRequester(advancedSection),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                TextButton(
                    onClick = onToggleAdvanced,
                    modifier = Modifier.focusRing().semantics {
                        stateDescription = if (advanced) "פתוח" else "סגור"
                    },
                ) {
                    Text("אפשרויות מתקדמות")
                    Text(if (advanced) "⌃" else "⌄", Modifier.padding(start = 8.dp))
                }
                if (advanced) {
                    CurrencyChooser(currency, onCurrencyChange)
                    if (draft.frequency != Frequency.NONE) {
                        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Text("מועד ההפקדה", style = MaterialTheme.typography.titleMedium)
                            ChoiceGroup(
                                Timing.entries, draft.timing,
                                label = { if (it == Timing.START) "בתחילת התקופה" else "בסוף התקופה" },
                                onSelect = { onChange(draft.copy(timing = it)) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun <T> ChoiceGroup(
    options: List<T>,
    selected: T,
    label: (T) -> String,
    onSelect: (T) -> Unit,
) {
    FlowRow(
        modifier = Modifier.selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEach { option ->
            FilterChip(
                selected = selected == option,
                onClick = { onSelect(option) },
                label = { Text(label(option)) },
                modifier = Modifier.heightIn(min = 48.dp).focusRing(10),
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = Sage,
                    selectedLabelColor = Ink,
                ),
            )
        }
    }
}

@Composable
private fun NumberField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    error: String?,
    modifier: Modifier = Modifier,
    suffix: String? = null,
    whole: Boolean = false,
    imeAction: ImeAction = ImeAction.Next,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { if (it.length <= 22) onChange(it) },
        modifier = modifier.fillMaxWidth(),
        label = { Text(label) },
        placeholder = { Text("0", color = Muted) },
        suffix = suffix?.let { { Text(it) } },
        supportingText = error?.let { { Text(it) } },
        isError = error != null,
        textStyle = MaterialTheme.typography.bodyLarge.copy(
            textDirection = TextDirection.Ltr,
            textAlign = TextAlign.Right,
            fontFeatureSettings = "tnum",
        ),
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = if (whole) KeyboardType.Number else KeyboardType.Decimal,
            imeAction = imeAction,
        ),
    )
}
