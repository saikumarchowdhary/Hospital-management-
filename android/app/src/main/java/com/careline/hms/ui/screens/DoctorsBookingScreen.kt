package com.careline.hms.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.careline.hms.data.remote.DoctorDto
import com.careline.hms.data.remote.SlotDto

@Composable
fun DoctorsBookingScreen(
    doctors: List<DoctorDto>,
    slots: List<SlotDto>,
    onSearch: (String) -> Unit,
    onLoadSlots: (Long, String) -> Unit,
    onBook: (Long, String, String, String) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var selectedDoctor by remember { mutableStateOf<DoctorDto?>(null) }
    var selectedDate by remember { mutableStateOf("2026-11-26") }
    var reason by remember { mutableStateOf("Follow-up clinical consultation") }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = {
                query = it
                onSearch(it)
            },
            label = { Text("Search doctors, specialty, department...") },
            modifier = Modifier.fillMaxWidth()
        )

        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(doctors) { doc ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(doc.fullName, fontWeight = FontWeight.Bold)
                        Text("${doc.specialtyName} · ${doc.departmentName} (${doc.branchName})")
                        Text("Fee: $${doc.consultationFee} · ${doc.availabilityStatus ?: "Available"}")
                        Button(onClick = {
                            selectedDoctor = doc
                            onLoadSlots(doc.id, selectedDate)
                        }) {
                            Text("View Available Slots")
                        }
                    }
                }
            }
        }
    }

    selectedDoctor?.let { doc ->
        AlertDialog(
            onDismissRequest = { selectedDoctor = null },
            title = { Text("Book with ${doc.fullName}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = selectedDate,
                        onValueChange = {
                            selectedDate = it
                            onLoadSlots(doc.id, it)
                        },
                        label = { Text("Date (YYYY-MM-DD)") }
                    )
                    OutlinedTextField(value = reason, onValueChange = { reason = it }, label = { Text("Reason") })
                    Text("Available Slots:", fontWeight = FontWeight.SemiBold)
                    slots.filter { it.status == "Available" }.take(6).forEach { slot ->
                        OutlinedButton(
                            onClick = {
                                onBook(doc.id, selectedDate, slot.slotTime, reason)
                                selectedDoctor = null
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Book ${slot.slotTime}")
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { selectedDoctor = null }) { Text("Close") }
            }
        )
    }
}
