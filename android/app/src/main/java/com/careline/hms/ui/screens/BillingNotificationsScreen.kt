package com.careline.hms.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.careline.hms.data.remote.InvoiceDto
import com.careline.hms.data.remote.NotificationDto

@Composable
fun BillingNotificationsScreen(
    invoices: List<InvoiceDto>,
    notifications: List<NotificationDto>,
    onPayInvoice: (Long, Double) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("Billing & Invoices", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        items(invoices) { inv ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${inv.invoiceNumber} · ${inv.status}", fontWeight = FontWeight.Bold)
                    Text(inv.description)
                    Text("Total: $${inv.totalAmount} · Balance Due: $${inv.balanceDue}")
                    if (inv.balanceDue > 0.0) {
                        Button(onClick = { onPayInvoice(inv.id, inv.balanceDue) }) {
                            Text("Pay Full Balance ($${inv.balanceDue})")
                        }
                    }
                }
            }
        }

        item {
            Text("Notifications (${notifications.size})", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        items(notifications.take(15)) { notif ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(notif.title, fontWeight = FontWeight.SemiBold)
                    Text(notif.message, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
