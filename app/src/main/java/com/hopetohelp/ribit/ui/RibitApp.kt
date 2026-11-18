package com.hopetohelp.ribit.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hopetohelp.ribit.R

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RibitApp(viewModel: CalculatorViewModel) {
    val saved by viewModel.saved.collectAsStateWithLifecycle(emptyList())
    val snackbar = remember { SnackbarHostState() }
    val destination = viewModel.destination
    val session = viewModel.session
    val showingResult = destination != Destination.SAVED && session.showingResult
    var showSave by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(viewModel.message) {
        viewModel.message?.let {
            snackbar.showSnackbar(it)
            viewModel.clearMessage()
        }
    }
    BackHandler(enabled = showingResult || destination != Destination.CALCULATE) {
        if (showingResult) viewModel.edit() else viewModel.navigate(Destination.CALCULATE)
    }

    Scaffold(
        containerColor = Paper,
        contentWindowInsets = WindowInsets.safeDrawing,
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            if (!WindowInsets.isImeVisible) {
                DestinationBar(destination, viewModel::navigate)
            }
        },
    ) { padding ->
        Box(
            Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding).imePadding(),
            contentAlignment = Alignment.TopCenter,
        ) {
            key(destination, showingResult, session.entryId) {
                Column(
                    Modifier.widthIn(max = 600.dp).fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    BrandBar(
                        showNew = destination != Destination.SAVED &&
                            (showingResult || session.entryId != null),
                        onNew = viewModel::reset,
                    )
                    when {
                        destination == Destination.SAVED ->
                            SavedScreen(saved, viewModel.busy, viewModel::open, viewModel::remove)
                        showingResult -> {
                            val calculation = checkNotNull(session.calculation)
                            ResultScreen(
                                calculation = calculation,
                                title = session.title,
                                onEdit = viewModel::edit,
                                onSave = { showSave = true },
                            )
                        }
                        else -> EditorScreen(session, viewModel)
                    }
                }
            }
        }
    }

    if (showSave && showingResult) {
        SaveDialog(
            title = session.title,
            updating = session.entryId != null,
            busy = viewModel.busy,
            onDismiss = { if (!viewModel.busy) showSave = false },
            onSave = { title, asNew ->
                viewModel.save(title, asNew) { showSave = false }
            },
        )
    }
}

@Composable
private fun BrandBar(showNew: Boolean, onNew: () -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painterResource(R.drawable.ic_launcher),
            contentDescription = null,
            modifier = Modifier.size(32.dp),
        )
        Text(
            "ריבית",
            Modifier.weight(1f).padding(start = 8.dp),
            style = MaterialTheme.typography.titleLarge,
        )
        if (showNew) {
            TextButton(onClick = onNew, modifier = Modifier.focusRing()) {
                Text("חישוב חדש")
            }
        }
    }
}

@Composable
private fun DestinationBar(current: Destination, onSelect: (Destination) -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface) {
        Column {
            HorizontalDivider(color = Border)
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 0.dp,
            ) {
                Destination.entries.forEach { destination ->
                    val icon = when (destination) {
                        Destination.CALCULATE -> R.drawable.ic_calculate
                        Destination.COMPARE -> R.drawable.ic_compare
                        Destination.SAVED -> R.drawable.ic_saved
                    }
                    NavigationBarItem(
                        selected = current == destination,
                        onClick = { onSelect(destination) },
                        modifier = Modifier.padding(horizontal = 4.dp).focusRing(18),
                        icon = { Icon(painterResource(icon), contentDescription = null) },
                        label = { Text(destination.title) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Ink,
                            selectedTextColor = Ink,
                            indicatorColor = Sage,
                            unselectedIconColor = Muted,
                            unselectedTextColor = Muted,
                        ),
                    )
                }
            }
        }
    }
}

@Composable
private fun EditorScreen(session: Session, model: CalculatorViewModel) {
    val comparing = session.drafts.size == 2
    var activePlan by rememberSaveable { mutableIntStateOf(0) }
    var advanced by rememberSaveable { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current

    LaunchedEffect(session.errors) {
        val invalidPlan = session.errors.indexOfFirst { it.isNotEmpty() }
        if (invalidPlan >= 0) activePlan = invalidPlan
    }

    ScreenHeading(if (comparing) "השוואת השקעות" else "חישוב השקעה")
    if (comparing) {
        ChoiceGroup(
            options = listOf(0, 1),
            selected = activePlan,
            label = { if (it == 0) "מסלול א׳" else "מסלול ב׳" },
            onSelect = { activePlan = it },
        )
    }

    key(activePlan) {
        PlanEditor(
            draft = session.drafts[activePlan],
            currency = session.currency,
            errors = session.errors.getOrNull(activePlan).orEmpty(),
            advanced = advanced,
            onToggleAdvanced = { advanced = !advanced },
            onCurrencyChange = model::changeCurrency,
            onChange = { model.changeDraft(activePlan, it) },
        )
    }

    Button(
        onClick = {
            focusManager.clearFocus()
            model.calculate()
        },
        modifier = Modifier.fillMaxWidth().focusRing(),
    ) {
        Text(if (comparing) "השוואת מסלולים" else "חישוב יתרה")
    }
}

@Composable
internal fun ScreenHeading(title: String) {
    Text(title, Modifier.semantics { heading() }, style = MaterialTheme.typography.headlineMedium)
}
