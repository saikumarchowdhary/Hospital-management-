package com.careline.hms.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.careline.hms.ui.viewmodel.HmsUiState

@Composable
fun PatientHomeScreen(
    state: HmsUiState,
    onSendSos: (String, String) -> Unit
) {
    var showSosDialog by remember { mutableStateOf(false) }
    var sosLocation by remember { mutableStateOf("") }
    var sosPhone by remember { mutableStateOf("") }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(
                "Welcome, ${state.currentUser?.fullName ?: "CareLine Member"}",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Text(
                "${state.currentUser?.roleName ?: ""} · ${state.currentUser?.userCode ?: ""}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        state.patientDashboard?.let { dash ->
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Clinical Summary", fontWeight = FontWeight.Bold)
                        Text("Released Labs: ${dash.releasedLabsCount} · Radiology: ${dash.releasedRadiologyCount} · Prescriptions: ${dash.activeRxCount}")
                        Text("Pending Invoices: ${dash.pendingPayments.count} ($${dash.pendingPayments.total})")
                        dash.upcomingAppointment?.let { appt ->
                            Text("Next Visit: ${appt.appointmentDate} ${appt.appointmentTime} with ${appt.doctorName}")
                        }
                    }
                }
            }
        }

        item {
            Button(
                onClick = { showSosDialog = true },
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Emergency Medical SOS")
            }
        }

        item {
            Text("Appointments (${state.appointments.size})", fontWeight = FontWeight.Bold)
        }
        items(state.appointments.take(10)) { appt ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text("${appt.appointmentRef} · ${appt.status}", fontWeight = FontWeight.SemiBold)
                    Text("${appt.appointmentDate} ${appt.appointmentTime} · ${appt.doctorName ?: appt.patientName ?: ""}")
                }
            }
        }

        item {
            Text("Diagnostic Lab Orders (${state.labOrders.size})", fontWeight = FontWeight.Bold)
        }
        items(state.labOrders.take(8)) { lab ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text("${lab.orderRef} · ${lab.testName}", fontWeight = FontWeight.SemiBold)
                    Text("Status: ${lab.status} · Result: ${lab.resultValue ?: "Pending / Gated"}")
                }
            }
        }
    }

    if (showSosDialog) {
        AlertDialog(
            onDismissRequest = { showSosDialog = false },
            title = { Text("Dispatch Emergency SOS") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = sosLocation, onValueChange = { sosLocation = it }, label = { Text("Current Location") })
                    OutlinedTextField(value = sosPhone, onValueChange = { sosPhone = it }, label = { Text("Callback Phone") })
                }
            },
            confirmButton = {
                Button(onClick = {
                    if (sosLocation.isNotBlank() && sosPhone.isNotBlank()) {
                        onSendSos(sosLocation, sosPhone)
                        showSosDialog = false
                    }
                }) { Text("Dispatch SOS") }
            },
            dismissButton = {
                TextButton(onClick = { showSosDialog = false }) { Text("Cancel") }
            }
        )
    }
}
