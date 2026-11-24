import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestServer } from './helpers.js';

test('Appointments: doctor discovery, slot booking, double-booking conflict, reschedule, cancel', async () => {
  const ctx = await startTestServer();
  try {
    const pat = ctx.createClient();
    await pat.login('patient@demo.com', 'Patient@123');

    const docsRes = await pat.get('/api/doctors');
    assert.equal(docsRes.status, 200);
    assert.ok(docsRes.data.doctors.length >= 3);
    const docId = docsRes.data.doctors[0].id;

    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const slotsRes = await pat.get(`/api/doctors/${docId}/slots?date=${tomorrow}`);
    assert.equal(slotsRes.status, 200);
    assert.ok(slotsRes.data.slots.length > 0);
    const freeSlot = slotsRes.data.slots.find((s) => s.status === 'Available');
    assert.ok(freeSlot);

    // Book slot
    const book1 = await pat.post('/api/appointments', {
      doctor_id: docId,
      appointment_date: tomorrow,
      appointment_time: freeSlot.slot_time,
      visit_type: 'In-Person',
      reason: 'Routine cardiac follow-up'
    });
    assert.equal(book1.status, 201);
    const aptId = book1.data.appointment.id;

    // Duplicate double booking blocked (409)
    const bookDup = await pat.post('/api/appointments', {
      doctor_id: docId,
      appointment_date: tomorrow,
      appointment_time: freeSlot.slot_time
    });
    assert.equal(bookDup.status, 409);

    // Reschedule to another slot
    const nextSlot = slotsRes.data.slots.find((s) => s.status === 'Available' && s.slot_time !== freeSlot.slot_time);
    const resched = await pat.patch(`/api/appointments/${aptId}/status`, {
      status: 'Rescheduled',
      new_date: tomorrow,
      new_time: nextSlot.slot_time
    });
    assert.equal(resched.status, 200);
    assert.equal(resched.data.appointment.status, 'Confirmed');
    assert.equal(resched.data.appointment.appointment_time, nextSlot.slot_time);

    // Cancel appointment frees the slot
    const cancel = await pat.patch(`/api/appointments/${aptId}/status`, { status: 'Cancelled' });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.data.appointment.status, 'Cancelled');

    // Appointment history lists it
    const list = await pat.get('/api/appointments');
    assert.equal(list.status, 200);
    assert.ok(list.data.appointments.some((a) => a.id === aptId && a.status === 'Cancelled'));
  } finally {
    await ctx.close();
  }
});
