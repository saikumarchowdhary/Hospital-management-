package com.careline.hms

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import com.careline.hms.ui.screens.*
import com.careline.hms.ui.theme.CareLineTheme
import com.careline.hms.ui.viewmodel.HmsViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CareLineTheme {
                CareLineAppShell()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CareLineAppShell(viewModel: HmsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState()
    var selectedTab by remember { mutableIntStateOf(0) }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message, state.error) {
        val msg = state.error ?: state.message
        if (!msg.isNullOrBlank()) {
            snackbarHostState.showSnackbar(msg)
            viewModel.clearFeedback()
        }
    }

    if (state.currentUser == null) {
        Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
            Surface(modifier = Modifier.padding(padding)) {
                LoginScreen(
                    loading = state.loading,
                    onLogin = viewModel::login,
                    onRegisterPatient = viewModel::registerPatient
                )
            }
        }
        return
    }

    val isStaff = state.currentUser?.role != "patient"

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("CareLine HMS") },
                actions = {
                    TextButton(onClick = viewModel::logout) { Text("Sign Out") }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                    label = { Text("Home") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.MedicalServices, contentDescription = "Doctors") },
                    label = { Text("Doctors") }
                )
                if (isStaff) {
                    NavigationBarItem(
                        selected = selectedTab == 2,
                        onClick = { selectedTab = 2 },
                        icon = { Icon(Icons.Default.Bed, contentDescription = "Beds") },
                        label = { Text("Beds") }
                    )
                }
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.Receipt, contentDescription = "Billing") },
                    label = { Text("Billing") }
                )
            }
        }
    ) { innerPadding ->
        Surface(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                0 -> PatientHomeScreen(state = state, onSendSos = viewModel::triggerEmergencySos)
                1 -> DoctorsBookingScreen(
                    doctors = state.doctors,
                    slots = state.selectedSlots,
                    onSearch = viewModel::searchDoctors,
                    onLoadSlots = viewModel::loadSlots,
                    onBook = viewModel::bookAppointment
                )
                2 -> if (isStaff) AdmissionsBedsScreen(
                    beds = state.beds,
                    transfers = state.bedTransfers,
                    loading = state.bedsLoading,
                    onRefresh = viewModel::refreshBeds,
                    onUpdateBedStatus = viewModel::updateBedStatus,
                    onTransferBed = viewModel::transferBed
                )
                3 -> BillingNotificationsScreen(
                    invoices = state.invoices,
                    notifications = state.notifications,
                    onPayInvoice = viewModel::payInvoice
                )
            }
        }
    }
}
