package com.hopetohelp.ribit.domain

import java.math.BigDecimal
import java.math.MathContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

object DecimalSerializer : KSerializer<BigDecimal> {
    override val descriptor = PrimitiveSerialDescriptor("Decimal", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: BigDecimal) {
        encoder.encodeString(value.toPlainString())
    }

    override fun deserialize(decoder: Decoder): BigDecimal = decoder.decodeString().toBigDecimal()
}

@Serializable
enum class CurrencyCode { ILS, USD, EUR, GBP }

@Serializable
enum class Frequency(val months: Int) { NONE(0), MONTHLY(1), YEARLY(12) }

@Serializable
enum class Timing { START, END }

val maxInvestment: BigDecimal = BigDecimal("999999999999.99")
val minRate: BigDecimal = BigDecimal("-100")
val maxRate: BigDecimal = BigDecimal("1000")
const val maxDuration = 1200

@Serializable
data class Plan(
    @Serializable(with = DecimalSerializer::class) val initial: BigDecimal,
    @Serializable(with = DecimalSerializer::class) val deposit: BigDecimal,
    @Serializable(with = DecimalSerializer::class) val annualRate: BigDecimal,
    val months: Int,
    val frequency: Frequency,
    val timing: Timing,
) {
    init {
        require(initial in BigDecimal.ZERO..maxInvestment)
        require(deposit in BigDecimal.ZERO..maxInvestment)
        require(annualRate > minRate && annualRate <= maxRate)
        require(months in 1..maxDuration)
        require(frequency != Frequency.NONE || deposit.signum() == 0)
    }
}

@Serializable
data class MonthPoint(
    val month: Int,
    @Serializable(with = DecimalSerializer::class) val contributed: BigDecimal,
    @Serializable(with = DecimalSerializer::class) val balance: BigDecimal,
) {
    val gain: BigDecimal get() = balance.subtract(contributed)
}

@Serializable
data class Projection(val points: List<MonthPoint>) {
    val final: MonthPoint get() = points.last()

    fun annualPoints(): List<MonthPoint> = points.filter {
        it.month % 12 == 0 || it.month == final.month
    }
}

data class CommonPeriod(val first: MonthPoint, val second: MonthPoint) {
    val difference: BigDecimal get() = first.balance.subtract(second.balance)
}

@Serializable
data class Calculation(
    val currency: CurrencyCode,
    val plans: List<Plan>,
    val projections: List<Projection>,
    val modelVersion: Int = 1,
) {
    fun commonPeriod(): CommonPeriod {
        require(projections.size == 2)
        val month = minOf(projections[0].final.month, projections[1].final.month)
        return CommonPeriod(projections[0].points[month], projections[1].points[month])
    }
}

object Calculator {
    fun calculate(currency: CurrencyCode, plans: List<Plan>): Calculation {
        require(plans.size in 1..2)
        return Calculation(currency, plans, plans.map(::project))
    }

    fun project(plan: Plan): Projection {
        val annual = plan.annualRate.movePointLeft(2).toDouble()
        val monthlyRate = StrictMath.expm1(StrictMath.log1p(annual) / 12.0)
        val factor = BigDecimal.ONE.add(BigDecimal.valueOf(monthlyRate))
        var balance = plan.initial
        var contributed = plan.initial
        val points = ArrayList<MonthPoint>(plan.months + 1)
        points += MonthPoint(0, contributed, balance)

        for (month in 1..plan.months) {
            val interval = plan.frequency.months
            val depositBeforeGrowth = interval > 0 &&
                plan.timing == Timing.START && (month - 1) % interval == 0
            val depositAfterGrowth = interval > 0 &&
                plan.timing == Timing.END && month % interval == 0
            if (depositBeforeGrowth) {
                balance = balance.add(plan.deposit)
                contributed = contributed.add(plan.deposit)
            }

            balance = balance.multiply(factor, MathContext.DECIMAL128)

            if (depositAfterGrowth) {
                balance = balance.add(plan.deposit)
                contributed = contributed.add(plan.deposit)
            }
            points += MonthPoint(month, contributed, balance)
        }
        return Projection(points)
    }
}
