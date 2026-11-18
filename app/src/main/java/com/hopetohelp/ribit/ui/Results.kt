package com.hopetohelp.ribit.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hopetohelp.ribit.domain.Calculation
import com.hopetohelp.ribit.domain.CurrencyCode
import com.hopetohelp.ribit.domain.MonthPoint
import com.hopetohelp.ribit.domain.Projection
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.util.Locale

private const val TRACK_A = "מסלול א׳"
private const val TRACK_B = "מסלול ב׳"

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ResultScreen(
    calculation: Calculation,
    title: String?,
    onEdit: () -> Unit,
    onSave: () -> Unit,
) {
    val comparing = calculation.projections.size == 2
    val currency = calculation.currency
    val first = calculation.projections.first()
    val second = calculation.projections.getOrNull(1)
    var showDetails by rememberSaveable { mutableStateOf(false) }

    ScreenHeading(title ?: if (comparing) "תוצאות ההשוואה" else "תוצאת החישוב")

    if (second == null) {
        ResultHero(
            caption = "יתרה צפויה",
            amount = first.final.balance,
            currency = currency,
            detail = "אחרי ${durationLabel(first.final.month)}",
        )
    } else {
        val common = calculation.commonPeriod()
        val difference = common.difference.setScale(2, RoundingMode.HALF_UP)
        val detail = when (difference.signum()) {
            1 -> "יתרה גבוהה יותר במסלול א׳"
            -1 -> "יתרה גבוהה יותר במסלול ב׳"
            else -> "היתרות שוות"
        }
        ResultHero(
            caption = "פער ביתרה אחרי ${durationLabel(common.first.month)}",
            amount = difference.abs(),
            currency = currency,
            detail = detail,
        )
    }

    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Button(onClick = onSave, modifier = Modifier.focusRing()) {
            Text(if (title == null) "שמירה בשם" else "שמירה")
        }
        OutlinedButton(onClick = onEdit, modifier = Modifier.focusRing()) {
            Text("עריכת נתונים")
        }
    }

    GrowthChart(first, second)

    if (second == null) {
        SummaryCard(first.final, currency)
    } else {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            if (maxWidth >= 460.dp) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TrackCard(TRACK_A, first.final, currency, Modifier.weight(1f))
                    TrackCard(TRACK_B, second.final, currency, Modifier.weight(1f))
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    TrackCard(TRACK_A, first.final, currency)
                    TrackCard(TRACK_B, second.final, currency)
                }
            }
        }
    }

    OutlinedButton(onClick = { showDetails = !showDetails }, modifier = Modifier.focusRing()) {
        Text(if (showDetails) "הסתרת פירוט שנתי" else "הצגת פירוט שנתי")
    }
    if (showDetails) {
        AnnualDetail(if (second == null) "פירוט שנתי" else TRACK_A, first, currency)
        if (second != null) AnnualDetail(TRACK_B, second, currency)
    }
}

@Composable
private fun ResultHero(caption: String, amount: BigDecimal, currency: CurrencyCode, detail: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Ink,
        contentColor = Color.White,
    ) {
        Column(
            Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Text(caption, style = MaterialTheme.typography.titleMedium, color = Sage)
            MoneyText(amount, currency, MaterialTheme.typography.displaySmall, Color.White)
            Text(detail, style = MaterialTheme.typography.bodyMedium, color = Sage)
        }
    }
}

@Composable
private fun TrackCard(
    title: String,
    point: MonthPoint,
    currency: CurrencyCode,
    modifier: Modifier = Modifier,
) {
    SummaryCard(point, currency, modifier) {
        Text(title, Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
        Metric("יתרה אחרי ${durationLabel(point.month)}", point.balance, currency)
        HorizontalDivider(color = Border)
    }
}

@Composable
private fun SummaryCard(
    point: MonthPoint,
    currency: CurrencyCode,
    modifier: Modifier = Modifier,
    header: @Composable () -> Unit = {},
) {
    ResultCard(modifier) {
        header()
        Metric("סך ההפקדות", point.contributed, currency)
        Metric(if (point.gain.signum() < 0) "הפסד משוער" else "רווח משוער", point.gain, currency)
    }
}

@Composable
private fun Metric(label: String, amount: BigDecimal, currency: CurrencyCode) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = Muted)
        MoneyText(amount, currency, MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun MoneyText(
    value: BigDecimal,
    currency: CurrencyCode,
    style: TextStyle,
    color: Color = Ink,
) {
    val formatted = remember(value, currency) { formatMoney(value, currency) }
    Text(
        formatted,
        color = color,
        style = style.copy(
            textDirection = TextDirection.Ltr,
            fontFeatureSettings = "tnum",
            fontSize = when {
                formatted.length > 30 && style.fontSize > 14.sp -> 14.sp
                formatted.length > 18 && style.fontSize > 24.sp -> 24.sp
                else -> style.fontSize
            },
        ),
    )
}

private fun formatMoney(value: BigDecimal, currency: CurrencyCode): String {
    val formatter = NumberFormat.getNumberInstance(Locale.US).apply {
        minimumFractionDigits = 2
        maximumFractionDigits = 2
        roundingMode = RoundingMode.HALF_UP
    }
    val rounded = value.setScale(2, RoundingMode.HALF_UP)
    val sign = if (rounded.signum() < 0) "−" else ""
    return "$sign${currency.symbol}\u00a0${formatter.format(rounded.abs())}"
}

@Composable
private fun GrowthChart(first: Projection, second: Projection?) {
    val maxMonth = maxOf(first.final.month, second?.final?.month ?: 0)
    val maximum = remember(first, second) {
        maxOf(
            1.0,
            first.points.maxOf { it.balance }.toDouble(),
            second?.points?.maxOf { it.balance }?.toDouble() ?: 0.0,
        )
    }
    val projections = remember(first, second) { listOfNotNull(first, second) }

    ResultCard {
        Text("יתרה לאורך זמן", Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
        Canvas(
            Modifier.fillMaxWidth().height(140.dp).semantics {
                contentDescription = "גרף יתרה לאורך ${durationLabel(maxMonth)}. ערכים מדויקים בפירוט השנתי."
            },
        ) {
            val margin = 4.dp.toPx()
            val width = size.width - 2 * margin
            val height = size.height - 2 * margin
            for (line in 0..4) {
                val y = margin + height * line / 4f
                drawLine(Border, Offset(margin, y), Offset(size.width - margin, y), 1.dp.toPx())
            }
            projections.forEachIndexed { index, projection ->
                val path = Path()
                projection.points.forEach { point ->
                    val x = margin + width * point.month / maxMonth
                    val y = margin + height * (1f - (point.balance.toDouble() / maximum).toFloat())
                    if (point.month == 0) path.moveTo(x, y) else path.lineTo(x, y)
                }
                drawPath(
                    path,
                    color = if (index == 0) Moss else Clay,
                    style = Stroke(
                        width = 3.dp.toPx(),
                        cap = StrokeCap.Round,
                        pathEffect = if (index == 0) null else
                            PathEffect.dashPathEffect(floatArrayOf(7.dp.toPx(), 5.dp.toPx())),
                    ),
                )
            }
        }
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("התחלה", color = Muted, style = MaterialTheme.typography.labelMedium)
                Text(durationLabel(maxMonth), color = Muted, style = MaterialTheme.typography.labelMedium)
            }
        }
        if (second != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                ChartLegend(TRACK_A, Moss, dashed = false)
                ChartLegend(TRACK_B, Clay, dashed = true)
            }
        }
    }
}

@Composable
private fun ChartLegend(label: String, color: Color, dashed: Boolean) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.size(18.dp, 8.dp)) {
            drawLine(
                color,
                Offset(0f, size.height / 2),
                Offset(size.width, size.height / 2),
                2.dp.toPx(),
                pathEffect = if (dashed) PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 3.dp.toPx())) else null,
            )
        }
        Text(label, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun AnnualDetail(title: String, projection: Projection, currency: CurrencyCode) {
    val points = remember(projection) { projection.annualPoints() }
    ResultCard {
        Text(title, Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
        points.forEach { point ->
            HorizontalDivider(color = Border)
            Text(
                if (point.month == 0) "בהתחלה" else "אחרי ${durationLabel(point.month)}",
                style = MaterialTheme.typography.titleMedium,
            )
            Metric("יתרה", point.balance, currency)
            Metric("סך ההפקדות", point.contributed, currency)
            Metric(if (point.gain.signum() < 0) "הפסד" else "רווח", point.gain, currency)
        }
    }
}

@Composable
internal fun ResultCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    OutlinedCard(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, Border),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            content()
        }
    }
}

internal fun durationLabel(total: Int): String {
    val years = total / 12
    val months = total % 12
    val yearText = if (years == 1) "שנה" else "$years שנים"
    val monthText = if (months == 1) "חודש" else "$months חודשים"
    return when {
        years == 0 -> monthText
        months == 0 -> yearText
        else -> "$yearText ו־$monthText"
    }
}
