package com.careline.hms.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.careline.hms.data.remote.*
import com.careline.hms.data.repository.AuthenticationRepository
import com.careline.hms.data.repository.HmsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HmsUiState(
    val currentUser: UserDto? = null,
    val loading: Boolean = false,
    val bedsLoading: Boolean = false,
    val message: String? = null,
    val error: String? = null,
    val patientDashboard: PatientDashboardResponse? = null,
    val patients: List<PatientDto> = emptyList(),
    val doctors: List<DoctorDto> = emptyList(),
    val selectedSlots: List<SlotDto> = emptyList(),
    val appointments: List<AppointmentSummaryDto> = emptyList(),
    val beds: List<BedDto> = emptyList(),
    val bedTransfers: List<BedTransferRecordDto> = emptyList(),
    val labOrders: List<LabOrderDto> = emptyList(),
    val invoices: List<InvoiceDto> = emptyList(),
    val notifications: List<NotificationDto> = emptyList()
)

@HiltViewModel
class HmsViewModel @Inject constructor(
    private val authRepository: AuthenticationRepository,
    private val repository: HmsRepository
) : ViewModel() {

    private val _state = MutableStateFlow(HmsUiState())
    val state: StateFlow<HmsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            if (authRepository.hasStoredSession()) {
                authRepository.restoreSession().onSuccess { user ->
                    if (user != null) {
                        _state.update { it.copy(currentUser = user) }
                        refreshWorkspace()
                    }
                }
            }
        }
        viewModelScope.launch {
            repository.wsEvents.collect { evt ->
                if (evt.eventType != "connected" && evt.eventType != "pong") {
                    _state.update {
                        it.copy(message = listOfNotNull(evt.title, evt.message).joinToString(": ").ifBlank { evt.eventType })
                    }
                    refreshWorkspace()
                }
            }
        }
    }

    fun clearFeedback() {
        _state.update { it.copy(message = null, error = null) }
    }

    fun login(identifier: String, password: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            authRepository.login(identifier, password)
                .onSuccess { user ->
                    _state.update { it.copy(loading = false, currentUser = user, message = "Signed in as ${user.fullName}") }
                    refreshWorkspace()
                }
                .onFailure { err ->
                    _state.update { it.copy(loading = false, error = err.message ?: "Authentication failed") }
                }
        }
    }

    fun registerPatient(
        fullName: String,
        email: String,
        mobile: String,
        dob: String,
        gender: String,
        address: String,
        password: String
    ) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            authRepository.registerPatient(RegisterPatientRequest(fullName, email, mobile, dob, gender, address, password))
                .onSuccess { user ->
                    _state.update { it.copy(loading = false, currentUser = user, message = "Patient registered: ${user.userCode}") }
                    refreshWorkspace()
                }
                .onFailure { err ->
                    _state.update { it.copy(loading = false, error = err.message ?: "Registration failed") }
                }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
            _state.value = HmsUiState(message = "Signed out")
        }
    }

    fun refreshBeds() {
        val user = _state.value.currentUser ?: return
        if (user.role == "patient") return
        viewModelScope.launch {
            _state.update { it.copy(bedsLoading = true) }
            repository.fetchBeds()
                .onSuccess { res ->
                    _state.update { it.copy(beds = res.beds, bedsLoading = false) }
                }
                .onFailure { err ->
                    _state.update { it.copy(bedsLoading = false, error = err.message ?: "Failed to fetch live bed states") }
                }
            repository.fetchBedTransfers().onSuccess { trfs ->
                _state.update { it.copy(bedTransfers = trfs) }
            }
        }
    }

    fun refreshWorkspace() {
        val user = _state.value.currentUser ?: return
        viewModelScope.launch {
            if (user.role == "patient") {
                repository.fetchPatientDashboard().onSuccess { dash ->
                    _state.update { it.copy(patientDashboard = dash) }
                }
            } else {
                repository.fetchPatients().onSuccess { pts ->
                    _state.update { it.copy(patients = pts) }
                }
                repository.fetchBeds().onSuccess { b ->
                    _state.update { it.copy(beds = b.beds) }
                }
                repository.fetchBedTransfers().onSuccess { trfs ->
                    _state.update { it.copy(bedTransfers = trfs) }
                }
            }
            repository.fetchDoctors().onSuccess { docs ->
                _state.update { it.copy(doctors = docs) }
            }
            repository.fetchAppointments().onSuccess { appts ->
                _state.update { it.copy(appointments = appts) }
            }
            repository.fetchLabOrders().onSuccess { labs ->
                _state.update { it.copy(labOrders = labs) }
            }
            repository.fetchInvoices().onSuccess { invs ->
                _state.update { it.copy(invoices = invs) }
            }
            repository.fetchNotifications().onSuccess { notifs ->
                _state.update { it.copy(notifications = notifs) }
            }
        }
    }

    fun searchDoctors(query: String) {
        viewModelScope.launch {
            repository.fetchDoctors(query).onSuccess { docs ->
                _state.update { it.copy(doctors = docs) }
            }
        }
    }

    fun loadSlots(doctorId: Long, date: String) {
        viewModelScope.launch {
            repository.fetchSlots(doctorId, date).onSuccess { slots ->
                _state.update { it.copy(selectedSlots = slots) }
            }
        }
    }

    fun bookAppointment(doctorId: Long, date: String, time: String, reason: String) {
        viewModelScope.launch {
            repository.bookAppointment(doctorId, _state.value.currentUser?.patientId, date, time, reason)
                .onSuccess {
                    _state.update { it.copy(message = "Appointment booked for $date at $time") }
                    refreshWorkspace()
                }
                .onFailure { err ->
                    _state.update { it.copy(error = err.message ?: "Booking failed") }
                }
        }
    }

    fun updateBedStatus(bedId: Long, status: String) {
        viewModelScope.launch {
            repository.updateBedStatus(bedId, status)
                .onSuccess { updated ->
                    _state.update { it.copy(message = "Bed ${updated.bedCode} updated to ${updated.status}") }
                    refreshWorkspace()
                }
                .onFailure { err ->
                    _state.update { it.copy(error = err.message ?: "Bed status update blocked") }
                }
        }
    }

    fun transferBed(fromBedId: Long, toBedId: Long, reason: String, releaseStatus: String = "Cleaning") {
        viewModelScope.launch {
            repository.transferBed(fromBedId, toBedId, reason, releaseStatus)
                .onSuccess { trf ->
                    _state.update { it.copy(message = "Bed transfer verified (${trf.transferRef})") }
                    refreshWorkspace()
                }
                .onFailure { err ->
                    _state.update { it.copy(error = err.message ?: "Transfer rejected") }
                }
        }
    }

    fun payInvoice(invoiceId: Long, amount: Double) {
        viewModelScope.launch {
            repository.payInvoice(invoiceId, amount)
                .onSuccess {
                    _state.update { it.copy(message = "Payment recorded successfully") }
                    refreshWorkspace()
                }
                .onFailure { err ->
                    _state.update { it.copy(error = err.message ?: "Payment failed") }
                }
        }
    }

    fun triggerEmergencySos(location: String, phone: String) {
        viewModelScope.launch {
            repository.sendSos("Medical Emergency", phone, location)
                .onSuccess { _state.update { it.copy(message = "Emergency SOS dispatched to Hospital Command") } }
                .onFailure { err -> _state.update { it.copy(error = err.message ?: "SOS dispatch failed") } }
        }
    }
}
