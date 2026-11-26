import { AppError } from '../middleware/errors.js';
import { logAudit } from './audit.js';
import { createNotification } from './notifications.js';

export const WORKFLOW_TRANSITIONS = {
  appointment: {
    Booked: ['Confirmed', 'Checked In', 'Cancelled', 'Rescheduled'],
    Confirmed: ['Checked In', 'Cancelled', 'Rescheduled', 'No Show'],
    Rescheduled: ['Confirmed', 'Checked In', 'Cancelled', 'No Show'],
    'Checked In': ['In Consultation', 'Completed', 'Checked Out', 'No Show', 'Cancelled'],
    'In Consultation': ['Completed', 'Checked Out'],
    Completed: ['Checked Out'],
    'Checked Out': [],
    Cancelled: [],
    'No Show': []
  },
  admission: {
    Requested: ['Approved', 'Admitted', 'Cancelled'],
    Approved: ['Admitted', 'Active Care', 'Cancelled'],
    Admitted: ['Active Care', 'Discharge Pending', 'Discharged'],
    'Active Care': ['Discharge Pending', 'Discharged'],
    'Discharge Pending': ['Discharged'],
    Discharged: [],
    Cancelled: []
  },
  laboratory: {
    Ordered: ['Scheduled', 'Specimen Collected'],
    Scheduled: ['Specimen Collected'],
    'Specimen Collected': ['Processing'],
    Processing: ['Awaiting Review'],
    'Awaiting Review': ['Released'],
    Released: []
  },
  pharmacy: {
    Requested: ['Under Review', 'Approved', 'Dispensed'],
    'Under Review': ['Approved', 'Dispensed'],
    Approved: ['Dispensed'],
    Dispensed: ['Completed'],
    Completed: []
  },
  insurance: {
    Draft: ['Submitted'],
    Submitted: ['Under Review'],
    'Under Review': ['Query Raised', 'Approved', 'Rejected'],
    'Query Raised': ['Resubmitted'],
    Resubmitted: ['Under Review', 'Approved', 'Rejected'],
    Approved: ['Settled'],
    Rejected: [],
    Settled: []
  },
  recruitment: {
    Submitted: ['Under Review', 'Shortlisted', 'Interview Scheduled', 'Not Selected'],
    'Under Review': ['Shortlisted', 'Interview Scheduled', 'Not Selected'],
    Shortlisted: ['Interview Scheduled', 'Selected', 'Not Selected'],
    'Interview Scheduled': ['Interview Scheduled', 'Selected', 'Offer Issued', 'Not Selected'],
    Selected: ['Offer Issued', 'Joined', 'Not Selected'],
    'Offer Issued': ['Joined', 'Not Selected'],
    Joined: [],
    'Not Selected': []
  },
  housekeeping: {
    Assigned: ['In Progress'],
    'In Progress': ['Awaiting Inspection'],
    'Awaiting Inspection': ['Completed', 'Assigned'],
    Completed: []
  },
  external: {
    Draft: ['Submitted'],
    Submitted: ['Approval Pending', 'Cancelled'],
    'Approval Pending': ['Provider Processing', 'Rejected'],
    'Provider Processing': ['Confirmed', 'Delayed', 'Unavailable', 'Escalated'],
    Confirmed: ['Fulfilled', 'Delayed', 'Cancelled'],
    Fulfilled: ['Closed'],
    Delayed: ['Confirmed', 'Escalated', 'Cancelled'],
    Escalated: ['Provider Processing', 'Confirmed', 'Cancelled'],
    Closed: [],
    Rejected: [],
    Unavailable: [],
    Cancelled: []
  }
};

export function validateAndRecordTransition(db, broker, { entityType, entityId, fromStatus, toStatus, actor, notes = null, notify = null }) {
  const map = WORKFLOW_TRANSITIONS[entityType];
  if (!map) throw new AppError(400, `Unsupported workflow entity: ${entityType}`);
  const allowed = map[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new AppError(409, `Invalid ${entityType} transition from "${fromStatus}" to "${toStatus}".`);
  }

  db.run(
    `INSERT INTO workflow_history (entity_type, entity_id, from_status, to_status, actor_id, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [entityType, entityId, fromStatus, toStatus, actor.id, notes]
  );

  logAudit(db, {
    actorUserId: actor.id,
    actorRole: actor.role,
    action: `${entityType}.transition`,
    entityType,
    entityId,
    details: { fromStatus, toStatus, notes }
  });

  if (notify) {
    createNotification(db, broker, notify);
  }
}
