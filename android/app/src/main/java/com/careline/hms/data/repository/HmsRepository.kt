package com.careline.hms.data.repository

import com.careline.hms.data.remote.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HmsRepository @Inject constructor(
    private val api: HmsApiService,
    private val wsClient: HmsWebSocketClient
) {
    val wsEvents = wsClient.events

    suspend fun fetchPatientDashboard(): Result<PatientDashboardResponse> = runCatching {
        api.getPatientDashboard()
    }

    suspend fun fetchPatients(query: String = ""): Result<List<PatientDto>> = runCatching {
        api.getPatients(query).patients
    }

    suspend fun sendSos(type: String, phone: String, location: String): Result<Unit> = runCatching {
        api.sendEmergencySos(EmergencySosRequest(type, phone, location))
    }

    suspend fun fetchDoctors(query: String = ""): Result<List<DoctorDto>> = runCatching {
        api.getDoctors(query).doctors
    }

    suspend fun fetchSlots(doctorId: Long, date: String): Result<List<SlotDto>> = runCatching {
        api.getDoctorSlots(doctorId, date).slots
    }

    suspend fun fetchAppointments(): Result<List<AppointmentSummaryDto>> = runCatching {
        api.getAppointments().appointments
    }

    suspend fun bookAppointment(
        doctorId: Long,
        patientId: Long?,
        date: String,
        time: String,
        reason: String
    ): Result<Unit> = runCatching {
        api.bookAppointment(BookAppointmentRequest(doctorId, patientId, date, time, "In-Person", reason))
    }

    suspend fun fetchBeds(): Result<BedsResponse> = runCatching {
        api.getBeds()
    }

    suspend fun updateBedStatus(bedId: Long, status: String): Result<BedDto> = runCatching {
        api.updateBedStatus(bedId, UpdateBedStatusRequest(status)).bed
    }

    suspend fun fetchAdmissions(): Result<List<AdmissionDto>> = runCatching {
        api.getAdmissions().admissions
    }

    suspend fun fetchBedTransfers(): Result<List<BedTransferRecordDto>> = runCatching {
        api.getBedTransfers().transfers
    }

    suspend fun transferBed(
        fromBedId: Long,
        toBedId: Long,
        reason: String,
        releaseStatus: String = "Cleaning"
    ): Result<BedTransferRecordDto> = runCatching {
        api.transferBed(BedTransferRequest(fromBedId, toBedId, reason, releaseStatus)).transfer
    }

    suspend fun fetchLabOrders(): Result<List<LabOrderDto>> = runCatching {
        api.getLabOrders().orders
    }

    suspend fun fetchInvoices(): Result<List<InvoiceDto>> = runCatching {
        api.getInvoices().invoices
    }

    suspend fun payInvoice(invoiceId: Long, amount: Double): Result<Unit> = runCatching {
        api.recordPayment(
            RecordPaymentRequest(
                invoiceId = invoiceId,
                amount = amount,
                idempotencyKey = "android-${invoiceId}-${System.currentTimeMillis()}"
            )
        )
    }

    suspend fun fetchNotifications(): Result<List<NotificationDto>> = runCatching {
        api.getNotifications().notifications
    }
}
