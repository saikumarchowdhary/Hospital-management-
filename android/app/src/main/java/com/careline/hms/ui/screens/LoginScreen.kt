package com.careline.hms.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun LoginScreen(
    loading: Boolean,
    onLogin: (String, String) -> Unit,
    onRegisterPatient: (String, String, String, String, String, String, String) -> Unit
) {
    var isRegister by remember { mutableStateOf(false) }
    var identifier by remember { mutableStateOf("patient@demo.com") }
    var password by remember { mutableStateOf("Patient@123") }
    var fullName by remember { mutableStateOf("") }
    var mobile by remember { mutableStateOf("") }
    var dob by remember { mutableStateOf("1992-05-14") }
    var gender by remember { mutableStateOf("Female") }
    var address by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("CareLine HMS", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text(
            if (isRegister) "Create a verified patient portal account" else "Sign in with your hospital portal credentials",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(24.dp))

        if (isRegister) {
            OutlinedTextField(value = fullName, onValueChange = { fullName = it }, label = { Text("Full Name") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
        }
        OutlinedTextField(
            value = identifier,
            onValueChange = { identifier = it },
            label = { Text(if (isRegister) "Email" else "Email or User Code") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(10.dp))
        if (isRegister) {
            OutlinedTextField(value = mobile, onValueChange = { mobile = it }, label = { Text("Mobile Number") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(value = dob, onValueChange = { dob = it }, label = { Text("Date of Birth (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(value = gender, onValueChange = { gender = it }, label = { Text("Gender") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(value = address, onValueChange = { address = it }, label = { Text("Address") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
        }
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(20.dp))

        Button(
            onClick = {
                if (isRegister) {
                    onRegisterPatient(fullName, identifier, mobile, dob, gender, address, password)
                } else {
                    onLogin(identifier, password)
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth().height(50.dp)
        ) {
            Text(if (loading) "Authenticating..." else if (isRegister) "Register Patient Account" else "Sign In")
        }

        Spacer(Modifier.height(12.dp))
        TextButton(onClick = { isRegister = !isRegister }, modifier = Modifier.fillMaxWidth()) {
            Text(if (isRegister) "Already have an account? Sign In" else "New Patient? Create Account")
        }
    }
}
