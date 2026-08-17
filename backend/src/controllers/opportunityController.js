import prisma from '../config/prisma.js'

// ─── Get all opportunities ─────────────────────────────────────────
export const getOpportunities = async (req, res) => {
  try {
    const { department, location, type } = req.query

    const where = {}
    if (department && department !== 'All') where.department = department
    if (location && location !== 'All') where.location = location
    if (type && type !== 'all') where.type = type

    const opportunities = await prisma.opportunity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { applications: true } },
      },
    })

    res.json(opportunities)
  } catch (err) {
    console.error('Get opportunities error:', err)
    res.status(500).json({ message: 'Failed to fetch opportunities' })
  }
}

// ─── Create opportunity ────────────────────────────────────────────
export const createOpportunity = async (req, res) => {
  try {
    const { roleTitle, department, type, location, description, requirements, duration, postedBy } = req.body

    if (!roleTitle || !department || !location || !description || !postedBy) {
      return res.status(400).json({ message: 'Missing required fields' })
    }

    const opportunity = await prisma.opportunity.create({
      data: {
        roleTitle,
        department,
        type: type || 'internship',
        location,
        description,
        requirements: requirements || [],
        duration: duration || '',
        postedBy,
        userId: req.user.id,
      },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { applications: true } },
      },
    })

    res.status(201).json(opportunity)
  } catch (err) {
    console.error('Create opportunity error:', err)
    res.status(500).json({ message: 'Failed to create opportunity' })
  }
}

// ─── Delete opportunity ────────────────────────────────────────────
export const deleteOpportunity = async (req, res) => {
  try {
    const { id } = req.params

    const opportunity = await prisma.opportunity.findUnique({ where: { id } })
    if (!opportunity) return res.status(404).json({ message: 'Opportunity not found' })
    if (opportunity.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this opportunity' })
    }

    await prisma.opportunity.delete({ where: { id } })
    res.json({ message: 'Opportunity deleted' })
  } catch (err) {
    console.error('Delete opportunity error:', err)
    res.status(500).json({ message: 'Failed to delete opportunity' })
  }
}

// ─── Apply to opportunity ──────────────────────────────────────────
export const applyToOpportunity = async (req, res) => {
  try {
    const { id } = req.params

    const opportunity = await prisma.opportunity.findUnique({ where: { id } })
    if (!opportunity) return res.status(404).json({ message: 'Opportunity not found' })

    // Check for duplicate application
    const existing = await prisma.application.findUnique({
      where: { userId_opportunityId: { userId: req.user.id, opportunityId: id } },
    })
    if (existing) return res.status(400).json({ message: 'Already applied' })

    const application = await prisma.application.create({
      data: {
        userId: req.user.id,
        opportunityId: id,
      },
    })

    res.status(201).json(application)
  } catch (err) {
    console.error('Apply to opportunity error:', err)
    res.status(500).json({ message: 'Failed to apply' })
  }
}

// ─── Get my applications ───────────────────────────────────────────
export const getMyApplications = async (req, res) => {
  try {
    const applications = await prisma.application.findMany({
      where: { userId: req.user.id },
      include: {
        opportunity: true,
      },
      orderBy: { appliedAt: 'desc' },
    })

    res.json(applications)
  } catch (err) {
    console.error('Get applications error:', err)
    res.status(500).json({ message: 'Failed to fetch applications' })
  }
}

// ─── Get filter options (unique departments & locations) ───────────
export const getFilterOptions = async (req, res) => {
  try {
    const departments = await prisma.opportunity.findMany({
      distinct: ['department'],
      select: { department: true },
    })
    const locations = await prisma.opportunity.findMany({
      distinct: ['location'],
      select: { location: true },
    })

    res.json({
      departments: ['All', ...departments.map(d => d.department)],
      locations: ['All', ...locations.map(l => l.location)],
    })
  } catch (err) {
    console.error('Get filter options error:', err)
    res.status(500).json({ message: 'Failed to fetch filter options' })
  }
}
