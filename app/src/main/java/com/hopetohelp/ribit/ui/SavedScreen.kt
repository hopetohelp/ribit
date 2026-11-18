package com.hopetohelp.ribit.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.hopetohelp.ribit.data.SavedSummary
import java.text.DateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SavedScreen(
    saved: List<SavedSummary>,
    busy: Boolean,
    onOpen: (SavedSummary) -> Unit,
    onDelete: (SavedSummary, () -> Unit) -> Unit,
) {
    var deleteId by rememberSaveable { mutableStateOf<String?>(null) }
    ScreenHeading("חישובים שמורים")

    if (saved.isEmpty()) {
        ResultCard {
            Text("אין עדיין חישובים שמורים", style = MaterialTheme.typography.titleMedium)
            Text("אחרי חישוב או השוואה, אפשר לשמור את התוצאה ולפתוח אותה כאן.", color = Muted)
        }
    }

    saved.forEach { entry ->
        androidx.compose.runtime.key(entry.id) {
            val date = remember(entry.updatedAt) {
                DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.forLanguageTag("he-IL"))
                    .format(Date(entry.updatedAt))
            }
            val kind = if (entry.planCount == 2) "השוואת מסלולים" else "חישוב יחיד"
            ResultCard {
                Text(entry.title, style = MaterialTheme.typography.titleLarge)
                Text("$kind · $date", color = Muted, style = MaterialTheme.typography.bodyMedium)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Button(
                        onClick = { onOpen(entry) },
                        enabled = !busy,
                        modifier = Modifier.focusRing().semantics {
                            contentDescription = "פתיחה, ${entry.title}"
                        },
                    ) {
                        Text("פתיחה")
                    }
                    TextButton(
                        onClick = { deleteId = entry.id },
                        enabled = !busy,
                        modifier = Modifier.focusRing().semantics {
                            contentDescription = "מחיקה, ${entry.title}"
                        },
                    ) {
                        Text("מחיקה")
                    }
                }
            }
        }
    }

    val toDelete = saved.firstOrNull { it.id == deleteId }
    if (toDelete != null) {
        AlertDialog(
            onDismissRequest = { if (!busy) deleteId = null },
            title = { Text("למחוק את החישוב?") },
            text = { Text(toDelete.title) },
            confirmButton = {
                TextButton(
                    onClick = { onDelete(toDelete) { deleteId = null } },
                    enabled = !busy,
                    modifier = Modifier.focusRing(),
                ) {
                    Text("מחיקה", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { deleteId = null },
                    enabled = !busy,
                    modifier = Modifier.focusRing(),
                ) {
                    Text("ביטול")
                }
            },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SaveDialog(
    title: String?,
    updating: Boolean,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSave: (String, Boolean) -> Unit,
) {
    var name by rememberSaveable(title) { mutableStateOf(title.orEmpty()) }
    val canSave = name.isNotBlank() && !busy
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (updating) "שמירת חישוב" else "שמירה בשם") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { if (it.length <= 80) name = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("שם החישוב") },
                singleLine = true,
                enabled = !busy,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { if (canSave) onSave(name, false) }),
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(name, false) },
                enabled = canSave,
                modifier = Modifier.focusRing(),
            ) {
                Text("שמירה")
            }
        },
        dismissButton = {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = onDismiss, enabled = !busy, modifier = Modifier.focusRing()) {
                    Text("ביטול")
                }
                if (updating) {
                    TextButton(
                        onClick = { onSave(name, true) },
                        enabled = canSave,
                        modifier = Modifier.focusRing(),
                    ) {
                        Text("שמירת עותק")
                    }
                }
            }
        },
    )
}
