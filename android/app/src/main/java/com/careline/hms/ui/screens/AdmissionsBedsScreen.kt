package com.careline.hms.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.careline.hms.data.remote.BedDto
import com.careline.hms.data.remote.BedTransferRecordDto

private val TRANSFER_REASONS = listOf(
    "Condition Worsened (Requires ICU / Specialized Care)",
    "Ward Upgrade Requested by Family",
    "Post-Surgery Recovery & Step-Down",
    "Infection Control & Isolation Protocol",
    "Attending Physician Direct Order"
)

@Composable
fun AdmissionsBedsScreen(
    beds: List<BedDto>,
    transfers: List<BedTransferRecordDto>,
    loading: Boolean = false,
    onRefresh: () -> Unit,
    onUpdateBedStatus: (Long, String) -> Unit,
    onTransferBed: (Long, Long, String, String) -> Unit
) {
    var statusFilter by remember { mutableStateOf("All") }
    var searchQuery by remember { mutableStateOf("") }
    var selectedBedForStatus by remember { mutableStateOf<BedDto?>(null) }
    var pendingStatus by remember { mutableStateOf("Available") }

    var transferModalOpen by remember { mutableStateOf(false) }
    var fromBedId by remember { mutableStateOf<Long?>(null) }
    var toBedId by remember { mutableStateOf<Long?>(null) }
    var reason by remember { mutableStateOf(TRANSFER_REASONS.first()) }
    var releaseStatus by remember { mutableStateOf("Cleaning") }

    LaunchedEffect(Unit) {
        onRefresh()
    }

    val occupiedCount = beds.count { it.status == "Occupied" }
    val availableCount = beds.count { it.status == "Available" }
    val cleaningCount = beds.count { it.status == "Cleaning" }
    val occupancyPct = if (beds.isEmpty()) 0 else (occupiedCount * 100) / beds.size

    val filteredBeds = remember(beds, statusFilter, searchQuery) {
        beds.filter { bed ->
            val matchesStatus = statusFilter == "All" || bed.status.equals(statusFilter, ignoreCase = true)
            val q = searchQuery.trim().lowercase()
            val matchesQuery = q.isEmpty() ||
                bed.bedCode.lowercase().contains(q) ||
                bed.wardName.lowercase().contains(q) ||
                bed.roomNumber.lowercase().contains(q) ||
                (bed.patientName?.lowercase()?.contains(q) == true)
            matchesStatus && matchesQuery
        }
    }

    val groupedByWard = remember(filteredBeds) {
        filteredBeds.groupBy { it.wardName }
    }

    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 165.dp),
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Inpatient Admissions & Bed Map",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "Live Retrofit ward map, cleaning gates & atomic transfers",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                } else {
                    IconButton(onClick = onRefresh) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh live bed status")
                    }
                }
            }
        }

        item(span = { GridItemSpan(maxLineSpan) }) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OccupancyMetricCard("Occupancy", "$occupancyPct%", Color(0xFF1E5EFF), Modifier.weight(1f))
                OccupancyMetricCard("Occupied", "$occupiedCount", Color(0xFF2563EB), Modifier.weight(1f))
                OccupancyMetricCard("Available", "$availableCount", Color(0xFF059669), Modifier.weight(1f))
                OccupancyMetricCard("Cleaning", "$cleaningCount", Color(0xFFD97706), Modifier.weight(1f))
            }
        }

        item(span = { GridItemSpan(maxLineSpan) }) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Search bed, ward, room, or patient") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                Button(
                    onClick = {
                        fromBedId = beds.firstOrNull { it.status == "Occupied" }?.id ?: beds.firstOrNull()?.id
                        toBedId = beds.firstOrNull { it.status == "Available" }?.id ?: beds.getOrNull(1)?.id
                        transferModalOpen = true
                    },
                    enabled = beds.size >= 2
                ) {
                    Icon(Icons.Default.SwapHoriz, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Transfer")
                }
            }
        }

        item(span = { GridItemSpan(maxLineSpan) }) {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf("All", "Available", "Occupied", "Cleaning").forEach { filter ->
                    FilterChip(
                        selected = statusFilter == filter,
                        onClick = { statusFilter = filter },
                        label = { Text(filter) }
                    )
                }
            }
        }

        if (groupedByWard.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        "No beds match the selected ward or status filter.",
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            groupedByWard.forEach { (wardName, wardBeds) ->
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Text(
                        "$wardName (${wardBeds.size} beds)",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                }
                items(wardBeds, key = { it.id }) { bed ->
                    BedMapGridCard(
                        bed = bed,
                        onClick = {
                            selectedBedForStatus = bed
                            pendingStatus = bed.status
                        },
                        onQuickTransfer = {
                            fromBedId = bed.id
                            toBedId = beds.firstOrNull { it.status == "Available" && it.id != bed.id }?.id
                            transferModalOpen = true
                        }
                    )
                }
            }
        }

        if (transfers.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    "Recent Verified Transfers",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            items(transfers.take(6), key = { it.id }, span = { GridItemSpan(maxLineSpan) }) { trf ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            "${trf.transferRef} · ${trf.fromBedCode ?: "?"} -> ${trf.toBedCode ?: "?"}",
                            fontWeight = FontWeight.Bold
                        )
                        Text("Patient: ${trf.patientName ?: "Admitted Patient"}", style = MaterialTheme.typography.bodySmall)
                        Text("Reason: ${trf.reason}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }

    selectedBedForStatus?.let { bed ->
        AlertDialog(
            onDismissRequest = { selectedBedForStatus = null },
            title = { Text("Manage Bed ${bed.bedCode}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${bed.wardName} · Room ${bed.roomNumber} (${bed.roomType ?: "Standard"})")
                    Text("Patient: ${bed.patientName ?: "Unassigned"}", fontWeight = FontWeight.Medium)
                    Text("Update Bed Status:", fontWeight = FontWeight.SemiBold)
                    listOf("Available", "Occupied", "Cleaning", "Maintenance").forEach { statusOption ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { pendingStatus = statusOption },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = pendingStatus == statusOption,
                                onClick = { pendingStatus = statusOption }
                            )
                            Text(statusOption)
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    onUpdateBedStatus(bed.id, pendingStatus)
                    selectedBedForStatus = null
                }) {
                    Text("Save Status")
                }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (bed.status == "Occupied") {
                        TextButton(onClick = {
                            selectedBedForStatus = null
                            fromBedId = bed.id
                            toBedId = beds.firstOrNull { it.status == "Available" && it.id != bed.id }?.id
                            transferModalOpen = true
                        }) {
                            Text("Transfer")
                        }
                    }
                    TextButton(onClick = { selectedBedForStatus = null }) {
                        Text("Close")
                    }
                }
            }
        )
    }

    if (transferModalOpen) {
        val occupiedBeds = beds.filter { it.status == "Occupied" }.ifEmpty { beds }
        val targetBeds = beds.filter { it.id != fromBedId }
        AlertDialog(
            onDismissRequest = { transferModalOpen = false },
            title = { Text("Bed Transfer Verification") },
            text = {
                Column(
                    modifier = Modifier.heightIn(max = 420.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text("Origin Bed (Occupied)", fontWeight = FontWeight.SemiBold)
                    occupiedBeds.take(4).forEach { b ->
                        Row(
                            modifier = Modifier.fillMaxWidth().clickable { fromBedId = b.id },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = fromBedId == b.id, onClick = { fromBedId = b.id })
                            Text("${b.bedCode} · ${b.patientName ?: b.status}", style = MaterialTheme.typography.bodySmall)
                        }
                    }

                    Text("Destination Bed (Must be Available)", fontWeight = FontWeight.SemiBold)
                    targetBeds.filter { it.status == "Available" }.ifEmpty { targetBeds }.take(4).forEach { b ->
                        Row(
                            modifier = Modifier.fillMaxWidth().clickable { toBedId = b.id },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = toBedId == b.id, onClick = { toBedId = b.id })
                            Text("${b.bedCode} (${b.wardName} · ${b.status})", style = MaterialTheme.typography.bodySmall)
                        }
                    }

                    Text("Mandatory Reason for Transfer", fontWeight = FontWeight.SemiBold)
                    Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        TRANSFER_REASONS.take(3).forEach { preset ->
                            FilterChip(
                                selected = reason == preset,
                                onClick = { reason = preset },
                                label = { Text(preset.substringBefore(" (")) }
                            )
                        }
                    }
                    OutlinedTextField(
                        value = reason,
                        onValueChange = { reason = it },
                        label = { Text("Clinical Reason") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(16.dp))
                        Text(
                            "Occupied destinations are rejected server-side (HTTP 409).",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFF92400E)
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    enabled = fromBedId != null && toBedId != null && fromBedId != toBedId && reason.isNotBlank(),
                    onClick = {
                        val origin = fromBedId ?: return@Button
                        val dest = toBedId ?: return@Button
                        onTransferBed(origin, dest, reason.trim(), releaseStatus)
                        transferModalOpen = false
                    }
                ) {
                    Text("Verify & Execute")
                }
            },
            dismissButton = {
                TextButton(onClick = { transferModalOpen = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun OccupancyMetricCard(label: String, value: String, accent: Color, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = accent.copy(alpha = 0.08f))
    ) {
        Column(modifier = Modifier.padding(10.dp), horizontalAlignment = Alignment.Start) {
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = accent)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun BedMapGridCard(
    bed: BedDto,
    onClick: () -> Unit,
    onQuickTransfer: () -> Unit
) {
    val (bg, border, badgeColor) = when (bed.status) {
        "Occupied" -> Triple(Color(0xFFEFF6FF), Color(0xFFBFDBFE), Color(0xFF1D4ED8))
        "Available" -> Triple(Color(0xFFECFDF5), Color(0xFFA7F3D0), Color(0xFF047857))
        else -> Triple(Color(0xFFFFFBEB), Color(0xFFFDE68A), Color(0xFFB45309))
    }

    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = bg),
        border = BorderStroke(1.dp, border)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Default.Bed, contentDescription = null, tint = badgeColor, modifier = Modifier.size(16.dp))
                    Text(bed.bedCode, fontWeight = FontWeight.Bold, color = badgeColor)
                }
                Text(bed.status, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = badgeColor)
            }
            Text(
                "Room ${bed.roomNumber} · ${bed.roomType ?: "Ward"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                bed.patientName ?: "Unassigned",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (bed.patientName != null) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (bed.status == "Occupied") {
                OutlinedButton(
                    onClick = onQuickTransfer,
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(vertical = 4.dp, horizontal = 8.dp)
                ) {
                    Text("Transfer", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}
