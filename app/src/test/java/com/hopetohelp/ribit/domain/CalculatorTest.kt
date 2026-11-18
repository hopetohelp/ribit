package com.hopetohelp.ribit.domain

import java.math.BigDecimal
import java.math.RoundingMode
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class CalculatorTest {
    @Test
    fun compoundsLumpSumUsingEffectiveAnnualRate() {
        val result = Calculator.project(plan(initial = "10000", interest = "5", months = 24))

        assertAmount("11025.00", result.final.balance)
        assertAmount("1025.00", result.final.gain)
        assertEquals(listOf(0, 12, 24), result.annualPoints().map { it.month })
    }

    @Test
    fun monthlyDepositsApplyAtSelectedTiming() {
        val yearAtTenPercent = plan(deposit = "100", interest = "10", frequency = Frequency.MONTHLY)
        val atEnd = Calculator.project(yearAtTenPercent)
        val atStart = Calculator.project(yearAtTenPercent.copy(timing = Timing.START))

        assertAmount("1254.05", atEnd.final.balance)
        assertAmount("1264.05", atStart.final.balance)
        assertAmount("1200.00", atStart.final.contributed)
    }

    @Test
    fun annualDepositsAtStartAndEndUseWholeYearBoundaries() {
        val input = plan(
            initial = "10000", deposit = "1000", interest = "5",
            months = 18, frequency = Frequency.YEARLY,
        )
        val atEnd = Calculator.project(input)
        val atStart = Calculator.project(input.copy(timing = Timing.START))

        assertAmount("11000.00", atEnd.final.contributed)
        assertAmount("12000.00", atStart.final.contributed)
        assertAmount("11500.00", atEnd.points[12].balance)
        assertAmount("11550.00", atStart.points[12].balance)
        assertEquals(listOf(0, 12, 18), atEnd.annualPoints().map { it.month })
    }

    @Test
    fun zeroRatePreservesCentsAndNegativeRateReportsLoss() {
        val withDeposits = plan(
            initial = "2.50", deposit = "1.01", months = 6, frequency = Frequency.MONTHLY,
        )
        val zero = Calculator.project(withDeposits)
        val loss = Calculator.project(plan(initial = "1000", interest = "-10"))

        assertAmount("8.56", zero.final.balance)
        assertAmount("0.00", zero.final.gain)
        assertAmount("900.00", loss.final.balance)
        assertAmount("-100.00", loss.final.gain)
    }

    @Test
    fun comparesDifferentDurationsAtTheSameMonth() {
        val result = Calculator.calculate(
            CurrencyCode.USD,
            listOf(
                plan(initial = "2500"),
                plan(initial = "1000", deposit = "1000", months = 24, frequency = Frequency.YEARLY),
            ),
        )
        val common = result.commonPeriod()

        assertEquals(12, common.first.month)
        assertEquals(12, common.second.month)
        assertAmount("500.00", common.difference)
        assertAmount("3000.00", result.projections[1].final.balance)
    }

    @Test
    fun snapshotPreservesInputsAndProjectedAmounts() {
        val original = Calculator.calculate(
            CurrencyCode.GBP,
            listOf(plan(initial = "1250.50", interest = "4.25", months = 13)),
        )

        val restored = Json.decodeFromString<Calculation>(Json.encodeToString(original))

        assertEquals(original.currency, restored.currency)
        assertEquals(original.plans, restored.plans)
        assertEquals(original.projections.first().points, restored.projections.first().points)
        assertEquals(1, restored.modelVersion)
    }

    private fun plan(
        initial: String = "0",
        deposit: String = "0",
        interest: String = "0",
        months: Int = 12,
        frequency: Frequency = Frequency.NONE,
    ) = Plan(initial.toBigDecimal(), deposit.toBigDecimal(), interest.toBigDecimal(), months, frequency, Timing.END)

    private fun assertAmount(expected: String, actual: BigDecimal) {
        assertEquals(expected, actual.setScale(2, RoundingMode.HALF_UP).toPlainString())
    }
}
