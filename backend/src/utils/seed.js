import bcrypt from 'bcryptjs'
import prisma from '../config/prisma.js'

const seedDatabase = async () => {
  try {
    const userCount = await prisma.user.count()
    if (userCount > 0) {
      console.log('Database already has data, skipping seed.')
      return
    }

    console.log('Seeding database with initial data...')

    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash('password123', salt)

    const usersData = [
      { name: 'Dr. Michael Chen', email: 'mchen@medzae.com', password: hash },
      { name: 'Prof. Emily Rodriguez', email: 'erodriguez@medzae.com', password: hash },
      { name: 'Alex Kim', email: 'alexkim@medzae.com', password: hash },
      { name: 'Dr. James Wilson', email: 'jwilson@medzae.com', password: hash },
      { name: 'Dr. Maria Garcia', email: 'mgarcia@medzae.com', password: hash },
      { name: 'Prof. David Lee', email: 'dlee@medzae.com', password: hash },
      { name: 'Rachel Thompson', email: 'rthompson@medzae.com', password: hash },
    ]

    const users = []
    for (const u of usersData) {
      const user = await prisma.user.create({ data: u })
      users.push(user)
    }

    // Create seed posts with likes (many-to-many)
    const postsData = [
      {
        authorId: users[0].id,
        content: 'Just finished a complex cardiac catheterization procedure. The new imaging technology made visualization so much clearer. Excited about the possibilities for improving patient outcomes! 🏥',
        tags: ['cardiology', 'innovation'],
        likeUserIds: [users[1].id, users[3].id],
      },
      {
        authorId: users[1].id,
        content: "New research published in NEJM shows promising results for early Alzheimer's detection using AI-powered retinal scans. This could revolutionize preventive neurology.\n\n#Neurology #AIinMedicine",
        tags: ['neurology', 'AI', 'research'],
        likeUserIds: [users[0].id, users[2].id, users[3].id, users[4].id],
      },
      {
        authorId: users[2].id,
        content: 'Day 127 of med school: Finally understanding the Krebs cycle without looking at my notes! 🎉 Small victories matter. Any tips for tackling biochemistry more effectively?',
        tags: ['medstudent', 'biochemistry'],
        likeUserIds: [users[5].id, users[6].id],
      },
      {
        authorId: users[3].id,
        content: 'Our lab just received approval for Phase II clinical trials of the new cancer immunotherapy. Three years of hard work paying off. Grateful to the entire research team! 🔬',
        tags: ['research', 'oncology', 'immunotherapy'],
        likeUserIds: [users[0].id, users[1].id, users[4].id],
      },
      {
        authorId: users[4].id,
        content: "PSA: Remember to check your patients' medication lists for drug interactions. Just caught a potentially dangerous combo that could have caused serious complications. Always double-check! ⚠️",
        tags: ['patientSafety', 'pharmacy'],
        likeUserIds: [users[0].id, users[5].id],
      },
      {
        authorId: users[5].id,
        content: "Attending the International Medical Education Conference next week. Excited to present our findings on simulation-based learning outcomes. Who else is going? Let's connect!",
        tags: ['MedEd', 'conference'],
        likeUserIds: [users[1].id],
      },
      {
        authorId: users[6].id,
        content: 'Successfully completed my first suturing practice today! The attending said I have steady hands. One step closer to the OR! 💪 #MedStudent #Surgery',
        tags: ['medstudent', 'surgery'],
        likeUserIds: [users[0].id, users[2].id, users[4].id],
      },
      {
        authorId: users[0].id,
        content: 'Reminder: The cardiovascular health webinar is starting in 30 minutes. Join us to discuss the latest in preventive cardiology and lifestyle interventions. Link in bio!',
        tags: ['webinar', 'cardiology'],
        likeUserIds: [users[3].id],
      },
    ]

    for (const p of postsData) {
      const { likeUserIds, ...postData } = p
      await prisma.post.create({
        data: {
          ...postData,
          likes: { connect: likeUserIds.map(id => ({ id })) },
        },
      })
    }

    // No seed events – events now come from Eventbrite API

    // ── Seed Opportunities ──────────────────────────────────────────
    const opportunitiesData = [
      {
        roleTitle: 'Clinical Research Intern',
        department: 'Cardiology',
        type: 'internship',
        location: 'Mumbai, India',
        description: 'Assist the cardiology team in ongoing clinical trials. Gain hands-on experience with patient data collection, ECG analysis, and research documentation.',
        requirements: ['MBBS student (3rd year+)', 'Interest in cardiology', 'Basic statistics knowledge'],
        duration: '3 months',
        postedBy: 'Apollo Hospitals',
        userId: users[0].id,
      },
      {
        roleTitle: 'Junior Resident – Emergency Medicine',
        department: 'Emergency Medicine',
        type: 'job',
        location: 'Delhi, India',
        description: 'Join our fast-paced emergency department. Manage acute cases, perform triage, and collaborate with a multidisciplinary team in a high-volume urban center.',
        requirements: ['MBBS degree', 'Completed internship', 'BLS/ACLS certification preferred'],
        duration: '1 year (renewable)',
        postedBy: 'AIIMS Delhi',
        userId: users[1].id,
      },
      {
        roleTitle: 'Pediatrics Intern',
        department: 'Pediatrics',
        type: 'internship',
        location: 'Bangalore, India',
        description: 'Rotate through general pediatrics, neonatology, and pediatric surgery. Learn clinical case management under expert mentorship.',
        requirements: ['MBBS student (final year)', 'Good communication skills', 'Willingness to work shifts'],
        duration: '6 months',
        postedBy: 'Manipal Hospital',
        userId: users[2].id,
      },
      {
        roleTitle: 'Radiology Technologist',
        department: 'Radiology',
        type: 'job',
        location: 'Hyderabad, India',
        description: 'Operate MRI, CT, and X-ray equipment. Ensure patient safety during imaging procedures and assist radiologists with report preparation.',
        requirements: ['B.Sc Radiology', '1+ year experience', 'Knowledge of PACS systems'],
        duration: 'Permanent',
        postedBy: 'Yashoda Hospitals',
        userId: users[3].id,
      },
      {
        roleTitle: 'Neurology Research Fellow',
        department: 'Neurology',
        type: 'job',
        location: 'Chennai, India',
        description: 'Conduct translational research on neurodegenerative disorders. Publish findings in peer-reviewed journals and present at national conferences.',
        requirements: ['MD/DNB Neurology', 'Prior research publications', 'Grant-writing experience a plus'],
        duration: '2 years',
        postedBy: 'CMC Vellore',
        userId: users[4].id,
      },
      {
        roleTitle: 'Public Health Intern',
        department: 'Community Medicine',
        type: 'internship',
        location: 'Pune, India',
        description: 'Support community outreach programs, assist in epidemiological surveys, and contribute to health education campaigns in rural areas.',
        requirements: ['MBBS/BDS student', 'Interest in public health', 'Fieldwork readiness'],
        duration: '2 months',
        postedBy: 'KEM Hospital',
        userId: users[5].id,
      },
      {
        roleTitle: 'Orthopedic Surgery Resident',
        department: 'Orthopedics',
        type: 'job',
        location: 'Kolkata, India',
        description: 'Assist in orthopedic surgeries including joint replacements and fracture fixations. Work alongside senior surgeons in a high-volume trauma center.',
        requirements: ['MS Orthopedics', 'Strong surgical aptitude', 'Ability to handle emergency cases'],
        duration: '3 years',
        postedBy: 'Fortis Hospital',
        userId: users[0].id,
      },
      {
        roleTitle: 'Dermatology Research Intern',
        department: 'Dermatology',
        type: 'internship',
        location: 'Jaipur, India',
        description: 'Participate in clinical studies on skin disorders, help with patient documentation, and assist in dermatopathology lab sessions.',
        requirements: ['MBBS student (3rd year+)', 'Interest in dermatology', 'Attention to detail'],
        duration: '4 months',
        postedBy: 'SMS Medical College',
        userId: users[1].id,
      },
      {
        roleTitle: 'Psychiatry Counselor',
        department: 'Psychiatry',
        type: 'job',
        location: 'Lucknow, India',
        description: 'Provide counseling and psychotherapy sessions for outpatients. Collaborate with psychiatrists on treatment plans for anxiety, depression, and other disorders.',
        requirements: ['M.Phil Clinical Psychology or equivalent', '1+ year experience', 'Empathetic communication skills'],
        duration: 'Permanent',
        postedBy: 'KGMU Hospital',
        userId: users[2].id,
      },
      {
        roleTitle: 'Ophthalmology Intern',
        department: 'Ophthalmology',
        type: 'internship',
        location: 'Ahmedabad, India',
        description: 'Observe and assist in cataract surgeries, retinal procedures, and outpatient eye examinations. Learn slit-lamp techniques and fundoscopy.',
        requirements: ['MBBS student (final year)', 'Interest in ophthalmology', 'Manual dexterity'],
        duration: '3 months',
        postedBy: 'Aravind Eye Hospital',
        userId: users[3].id,
      },
      {
        roleTitle: 'Anesthesiology Resident',
        department: 'Anesthesiology',
        type: 'job',
        location: 'Mumbai, India',
        description: 'Administer anesthesia for surgical procedures, manage patients in the ICU, and participate in pain management clinics. Exposure to cardiac and neuro-anesthesia.',
        requirements: ['MD Anesthesiology', 'BLS/ACLS certified', 'Ability to work under pressure'],
        duration: '2 years',
        postedBy: 'Lilavati Hospital',
        userId: users[4].id,
      },
      {
        roleTitle: 'Pathology Lab Technician',
        department: 'Pathology',
        type: 'job',
        location: 'Chandigarh, India',
        description: 'Process tissue samples, prepare histopathology slides, and support pathologists with diagnostic workflows in a NABL-accredited laboratory.',
        requirements: ['B.Sc MLT or DMLT', 'Knowledge of histopathology', 'Lab safety awareness'],
        duration: 'Permanent',
        postedBy: 'PGI Chandigarh',
        userId: users[5].id,
      },
    ]

    for (const opp of opportunitiesData) {
      await prisma.opportunity.create({ data: opp })
    }

    console.log('Database seeded successfully!')
  } catch (error) {
    console.error('Error seeding database:', error.message)
  }
}

export default seedDatabase
