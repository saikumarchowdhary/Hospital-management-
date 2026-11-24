package com.careline.hms.data.remote

import com.google.gson.annotations.SerializedName

data class LoginRequest(
    val identifier: String,
    val password: String,
    val remember: Boolean = true
)

data class RegisterPatientRequest(
    @SerializedName("full_name") val fullName: String,
    val email: String,
    val mobile: String,
    val dob: String,
    val gender: String,
    val address: String,
    val password: String,
    @SerializedName("account_type") val accountType: String = "patient",
    val consent: Boolean = true
)

data class RefreshTokenRequest(
    val refreshToken: String
)

data class ForgotPasswordRequest(
    val email: String
)

data class ResetPasswordRequest(
    val email: String,
    val code: String,
    @SerializedName("new_password") val newPassword: String
)

data class UserDto(
    val id: Long,
    @SerializedName("user_code") val userCode: String,
    val email: String,
    @SerializedName("full_name") val fullName: String,
    val role: String,
    @SerializedName("role_name") val roleName: String,
    @SerializedName("patient_id") val patientId: Long? = null,
    @SerializedName("doctor_id") val doctorId: Long? = null,
    @SerializedName("department_name") val departmentName: String? = null,
    @SerializedName("branch_name") val branchName: String? = null,
    val permissions: List<String> = emptyList()
)

data class AuthResponse(
    val token: String,
    val refreshToken: String? = null,
    val expiresAt: Long? = null,
    val user: UserDto
)

data class CurrentUserResponse(
    val user: UserDto
)

data class MessageResponse(
    val message: String? = null
)

data class PatientDto(
    val id: Long,
    @SerializedName("patient_code") val patientCode: String,
    @SerializedName("full_name") val fullName: String,
    val email: String? = null,
    val phone: String? = null,
    val dob: String? = null,
    val gender: String? = null,
    @SerializedName("blood_group") val bloodGroup: String? = null,
    val allergies: String? = null
)

data class PatientsResponse(val patients: List<PatientDto> = emptyList())

data class PatientDetailResponse(
    val patient: PatientDto? = null,
    val admissions: List<AdmissionDto> = emptyList()
)

data class AppointmentSummaryDto(
    val id: Long,
    @SerializedName("appointment_ref") val appointmentRef: String,
    @SerializedName("appointment_date") val appointmentDate: String,
    @SerializedName("appointment_time") val appointmentTime: String,
    val status: String,
    @SerializedName("doctor_name") val doctorName: String? = null,
    @SerializedName("patient_name") val patientName: String? = null,
    @SerializedName("specialty_name") val specialtyName: String? = null
)

data class PendingPaymentsDto(
    val count: Int = 0,
    val total: Double = 0.0
)

data class PatientDashboardResponse(
    val upcomingAppointment: AppointmentSummaryDto? = null,
    val pendingPayments: PendingPaymentsDto = PendingPaymentsDto(),
    val releasedLabsCount: Int = 0,
    val releasedRadiologyCount: Int = 0,
    val activeRxCount: Int = 0
)

data class DoctorDto(
    val id: Long,
    @SerializedName("full_name") val fullName: String,
    @SerializedName("specialty_name") val specialtyName: String,
    @SerializedName("department_name") val departmentName: String,
    @SerializedName("branch_name") val branchName: String,
    val qualification: String? = null,
    @SerializedName("consultation_fee") val consultationFee: Double = 0.0,
    @SerializedName("availability_status") val availabilityStatus: String? = null
)

data class DoctorsResponse(val doctors: List<DoctorDto> = emptyList())

data class SlotDto(
    val id: Long,
    @SerializedName("slot_date") val slotDate: String,
    @SerializedName("slot_time") val slotTime: String,
    val status: String
)

data class SlotsResponse(val date: String, val slots: List<SlotDto> = emptyList())

data class BookAppointmentRequest(
    @SerializedName("doctor_id") val doctorId: Long,
    @SerializedName("patient_id") val patientId: Long? = null,
    @SerializedName("appointment_date") val appointmentDate: String,
    @SerializedName("appointment_time") val appointmentTime: String,
    @SerializedName("visit_type") val visitType: String = "In-Person",
    val reason: String
)

data class AppointmentsResponse(val appointments: List<AppointmentSummaryDto> = emptyList())

data class WardDto(
    val id: Long,
    val name: String,
    @SerializedName("ward_type") val wardType: String? = null,
    val floor: String? = null
)

data class BedDto(
    val id: Long,
    @SerializedName("bed_code") val bedCode: String,
    @SerializedName("ward_name") val wardName: String,
    @SerializedName("ward_type") val wardType: String? = null,
    val floor: String? = null,
    @SerializedName("room_number") val roomNumber: String,
    @SerializedName("room_type") val roomType: String? = null,
    @SerializedName("daily_rate") val dailyRate: Double? = null,
    val status: String,
    @SerializedName("active_admission_id") val activeAdmissionId: Long? = null,
    @SerializedName("admission_ref") val admissionRef: String? = null,
    @SerializedName("patient_name") val patientName: String? = null
)

data class BedsResponse(
    val beds: List<BedDto> = emptyList(),
    val wards: List<WardDto> = emptyList()
)

data class UpdateBedStatusRequest(
    val status: String
)

data class BedStatusResponse(
    val bed: BedDto
)

data class AdmissionDto(
    val id: Long,
    @SerializedName("admission_ref") val admissionRef: String,
    @SerializedName("patient_name") val patientName: String? = null,
    @SerializedName("patient_code") val patientCode: String? = null,
    @SerializedName("doctor_name") val doctorName: String? = null,
    @SerializedName("department_name") val departmentName: String? = null,
    @SerializedName("bed_code") val bedCode: String? = null,
    @SerializedName("ward_name") val wardName: String? = null,
    val status: String
)

data class AdmissionsResponse(
    val admissions: List<AdmissionDto> = emptyList()
)

data class BedTransferRequest(
    @SerializedName("from_bed_id") val fromBedId: Long,
    @SerializedName("to_bed_id") val toBedId: Long,
    val reason: String,
    @SerializedName("release_status") val releaseStatus: String = "Cleaning"
)

data class BedTransferRecordDto(
    val id: Long,
    @SerializedName("transfer_ref") val transferRef: String,
    val reason: String,
    @SerializedName("patient_name") val patientName: String? = null,
    @SerializedName("from_bed_code") val fromBedCode: String? = null,
    @SerializedName("to_bed_code") val toBedCode: String? = null,
    @SerializedName("actor_name") val actorName: String? = null,
    @SerializedName("created_at") val createdAt: String? = null
)

data class BedTransferResponse(
    val transfer: BedTransferRecordDto
)

data class BedTransfersListResponse(
    val transfers: List<BedTransferRecordDto> = emptyList()
)

data class PharmacyInventoryItemDto(
    val id: Long,
    val name: String,
    @SerializedName("stock_qty") val stockQty: Int = 0,
    @SerializedName("unit_price") val unitPrice: Double = 0.0
)

data class PharmacyInventoryResponse(
    val inventory: List<PharmacyInventoryItemDto> = emptyList()
)

data class PrescriptionDto(
    val id: Long,
    @SerializedName("rx_number") val rxNumber: String,
    @SerializedName("patient_name") val patientName: String? = null,
    val status: String
)

data class PrescriptionsResponse(
    val prescriptions: List<PrescriptionDto> = emptyList()
)

data class RadiologyOrderDto(
    val id: Long,
    @SerializedName("order_ref") val orderRef: String,
    @SerializedName("modality_name") val modalityName: String? = null,
    @SerializedName("patient_name") val patientName: String? = null,
    val status: String
)

data class RadiologyOrdersResponse(
    val orders: List<RadiologyOrderDto> = emptyList()
)

data class BloodUnitDto(
    val id: Long,
    @SerializedName("bag_number") val bagNumber: String,
    @SerializedName("blood_group") val bloodGroup: String? = null,
    val status: String
)

data class BloodBankOverviewResponse(
    val inventory: List<BloodUnitDto> = emptyList()
)

data class InvoiceDto(
    val id: Long,
    @SerializedName("invoice_number") val invoiceNumber: String,
    @SerializedName("patient_name") val patientName: String? = null,
    val description: String,
    @SerializedName("total_amount") val totalAmount: Double,
    @SerializedName("balance_due") val balanceDue: Double,
    val status: String
)

data class InvoicesResponse(val invoices: List<InvoiceDto> = emptyList())

data class BillingLedgerResponse(
    val totalCollected: Double = 0.0,
    val outstandingBalance: Double = 0.0
)

data class RecordPaymentRequest(
    @SerializedName("invoice_id") val invoiceId: Long,
    val amount: Double,
    val method: String = "Mobile Card",
    @SerializedName("idempotency_key") val idempotencyKey: String
)

data class NotificationDto(
    val id: Long,
    val title: String,
    val message: String,
    val category: String? = null,
    @SerializedName("is_read") val isRead: Int = 0,
    @SerializedName("created_at") val createdAt: String? = null
)

data class NotificationsResponse(val notifications: List<NotificationDto> = emptyList())

data class LabOrderDto(
    val id: Long,
    @SerializedName("order_ref") val orderRef: String,
    @SerializedName("test_name") val testName: String,
    val status: String,
    @SerializedName("result_value") val resultValue: String? = null
)

data class LabOrdersResponse(val orders: List<LabOrderDto> = emptyList())

data class DashboardKpisDto(
    val totalPatients: Int = 0,
    val activeAdmissions: Int = 0,
    val occupiedBeds: Int = 0,
    val totalBeds: Int = 0,
    val pendingInvoices: Int = 0
)

data class DashboardReportResponse(
    val kpis: DashboardKpisDto = DashboardKpisDto()
)

data class EmergencySosRequest(
    @SerializedName("emergency_type") val emergencyType: String,
    @SerializedName("contact_phone") val contactPhone: String,
    @SerializedName("location_text") val locationText: String,
    val notes: String = ""
)
