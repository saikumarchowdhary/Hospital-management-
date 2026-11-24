package com.careline.hms.data.remote

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface HmsApiService {
    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("api/auth/register")
    suspend fun registerPatient(@Body body: RegisterPatientRequest): AuthResponse

    @POST("api/auth/refresh")
    suspend fun refreshToken(@Body body: RefreshTokenRequest): AuthResponse

    @GET("api/auth/me")
    suspend fun getCurrentUser(): CurrentUserResponse

    @POST("api/auth/logout")
    suspend fun logout(): MessageResponse

    @POST("api/auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): MessageResponse

    @POST("api/auth/reset-password")
    suspend fun resetPassword(@Body body: ResetPasswordRequest): MessageResponse

    @GET("api/patients")
    suspend fun getPatients(@Query("q") query: String = ""): PatientsResponse

    @GET("api/patients/{id}")
    suspend fun getPatientDetail(@Path("id") patientId: Long): PatientDetailResponse

    @GET("api/patients/me/dashboard")
    suspend fun getPatientDashboard(): PatientDashboardResponse

    @POST("api/patients/emergency/sos")
    suspend fun sendEmergencySos(@Body body: EmergencySosRequest)

    @GET("api/doctors")
    suspend fun getDoctors(@Query("q") query: String = ""): DoctorsResponse

    @GET("api/doctors/{id}/slots")
    suspend fun getDoctorSlots(
        @Path("id") doctorId: Long,
        @Query("date") date: String
    ): SlotsResponse

    @GET("api/appointments")
    suspend fun getAppointments(): AppointmentsResponse

    @POST("api/appointments")
    suspend fun bookAppointment(@Body body: BookAppointmentRequest)

    @PATCH("api/appointments/{id}/status")
    suspend fun updateAppointmentStatus(
        @Path("id") appointmentId: Long,
        @Body body: Map<String, String>
    )

    @GET("api/beds")
    suspend fun getBeds(): BedsResponse

    @PATCH("api/beds/{id}/status")
    suspend fun updateBedStatus(
        @Path("id") bedId: Long,
        @Body body: UpdateBedStatusRequest
    ): BedStatusResponse

    @GET("api/admissions")
    suspend fun getAdmissions(): AdmissionsResponse

    @GET("api/admissions/transfers")
    suspend fun getBedTransfers(): BedTransfersListResponse

    @POST("api/admissions/transfer")
    suspend fun transferBed(@Body body: BedTransferRequest): BedTransferResponse

    @GET("api/pharmacy/inventory")
    suspend fun getPharmacyInventory(): PharmacyInventoryResponse

    @GET("api/pharmacy/prescriptions")
    suspend fun getPrescriptions(): PrescriptionsResponse

    @POST("api/pharmacy/prescriptions/{id}/dispense")
    suspend fun dispensePrescription(@Path("id") prescriptionId: Long)

    @GET("api/laboratory/orders")
    suspend fun getLabOrders(): LabOrdersResponse

    @POST("api/laboratory/orders/{id}/release")
    suspend fun releaseLabOrder(@Path("id") orderId: Long)

    @GET("api/radiology/orders")
    suspend fun getRadiologyOrders(): RadiologyOrdersResponse

    @GET("api/bloodbank/overview")
    suspend fun getBloodBankOverview(): BloodBankOverviewResponse

    @GET("api/billing/invoices")
    suspend fun getInvoices(): InvoicesResponse

    @GET("api/billing/ledger")
    suspend fun getBillingLedger(): BillingLedgerResponse

    @POST("api/billing/payments")
    suspend fun recordPayment(@Body body: RecordPaymentRequest)

    @GET("api/reports/dashboard")
    suspend fun getDashboardReport(): DashboardReportResponse

    @GET("api/notifications")
    suspend fun getNotifications(): NotificationsResponse

    @PATCH("api/notifications/{id}/read")
    suspend fun markNotificationRead(@Path("id") id: Long)
}
