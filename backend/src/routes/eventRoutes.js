import express from 'express'
import { getEvents, createEvent, toggleRegistration, deleteEvent, getEventbriteEvents, refreshEventbriteCache, getExternalEvents, refreshExternalEvents, getMyRegistrations, confirmRegistration, cancelRegistration, runReminders } from '../controllers/eventController.js'
import { protect } from '../middleware/auth.js'

const router = express.Router()

// External-source routes (specific routes BEFORE parameterized ones)
router.get('/external', protect, getExternalEvents)
router.post('/external/refresh', protect, refreshExternalEvents)

// Eventbrite routes (kept for backward compatibility)
router.get('/eventbrite', protect, getEventbriteEvents)
router.post('/eventbrite/refresh', protect, refreshEventbriteCache)

// Registrations — the calendar's data source. Confirmed by the user, snapshot
// stored, works for local and external events alike.
router.get('/registrations', protect, getMyRegistrations)
router.post('/registrations', protect, confirmRegistration)
router.delete('/registrations/:eventKey', protect, cancelRegistration)

// Reminder sweep for an external scheduler. Authenticated by a shared secret,
// not a session, so it deliberately sits outside `protect`.
router.post('/reminders/run', runReminders)

router.get('/', protect, getEvents)
router.post('/', protect, createEvent)
router.put('/:id/register', protect, toggleRegistration)
router.delete('/:id', protect, deleteEvent)

export default router
