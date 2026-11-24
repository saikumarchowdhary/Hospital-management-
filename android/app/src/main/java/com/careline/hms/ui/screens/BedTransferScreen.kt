package com.careline.hms.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.careline.hms.data.remote.BedDto

@Composable
fun BedTransferScreen(
    beds: List<BedDto>,
    onTransferBed: (Long, Long, String) -> Unit
) {
    var originBed by remember { mutableStateOf<BedDto?>(null) }
    var targetBedId by remember { mutableStateOf<Long?>(null) }
    var reason by remember { mutableStateOf("Condition Worsened (Requires ICU / Specialized Care)") }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Ward Floor Map & Bed Transfers", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(beds) { bed ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("${bed.bedCode} · ${bed.status}", fontWeight = FontWeight.Bold)
                        Text("${bed.wardName} (Room ${bed.roomNumber})")
                        Text("Patient: ${bed.patientName ?: "Unassigned"}")
                        if (bed.status == "Occupied") {
                            Button(onClick = {
                                originBed = bed
                                targetBedId = beds.firstOrNull { it.status == "Available" }?.id
                            }) {
                                Text("Verify & Transfer Patient")
                            }
                        }
                    }
                }
            }
        }
    }

    originBed?.let { from ->
        val availableTargets = beds.filter { it.status == "Available" && it.id != from.id }
        AlertDialog(
            onDismissRequest = { originBed = null },
            title = { Text("Bed Transfer Verification (${from.bedCode})") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Relocating ${from.patientName ?: "Admitted Patient"}")
                    Text("Select Available Destination Bed:", fontWeight = FontWeight.SemiBold)
                    availableTargets.take(5).forEach { target ->
                        Row(modifier = Modifier.fillMaxWidth()) {
                            RadioButton(selected = targetBedId == target.id, onClick = { targetBedId = target.id })
                            Text("${target.bedCode} (${target.wardName})", modifier = Modifier.padding(top = 12.dp))
                        }
                    }
                    OutlinedTextField(
                        value = reason,
                        onValueChange = { reason = it },
                        label = { Text("Mandatory Clinical Reason") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = targetBedId != null && reason.isNotBlank(),
                    onClick = {
                        targetBedId?.let { toId ->
                            onTransferBed(from.id, toId, reason.trim())
                            originBed = null
                        }
                    }
                ) { Text("Confirm Transfer") }
            },
            dismissButton = {
                TextButton(onClick = { originBed = null }) { Text("Cancel") }
            }
        )
    }
}
