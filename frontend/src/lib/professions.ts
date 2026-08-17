/**
 * Which background details each profession is asked for, and what to call
 * them.
 *
 * The columns behind these are shared — a student's "College" and a doctor's
 * "Hospital" are both `institution`. Only the label and the placeholder
 * change, which keeps the schema small while the form stays specific to who
 * is filling it in.
 *
 * Both the profile editor and the public profile read this, so a field can
 * never be labelled one way while you edit it and another way when someone
 * else reads it.
 */

export type ProfessionValue = 'student' | 'doctor' | 'professor' | 'researcher' | 'other';

export type ProfileFieldKey =
  | 'institution'
  | 'specialty'
  | 'qualification'
  | 'designation'
  | 'yearsExperience'
  | 'studyYear'
  | 'graduationYear';

export interface ProfessionField {
  key: ProfileFieldKey;
  label: string;
  placeholder?: string;
  type?: 'text' | 'number';
}

export interface Profession {
  value: ProfessionValue;
  label: string;
  /** Shown under the section heading once this profession is chosen. */
  caption: string;
  fields: ProfessionField[];
}

export const PROFESSIONS: Profession[] = [
  {
    value: 'student',
    label: 'Medical student',
    caption: 'Where you study, and what you are working towards.',
    fields: [
      { key: 'qualification', label: 'Course', placeholder: 'MBBS, BDS, BAMS, BPT…' },
      { key: 'institution', label: 'College / University', placeholder: 'Your medical college' },
      { key: 'studyYear', label: 'Year of study', placeholder: 'Third year' },
      { key: 'graduationYear', label: 'Expected graduation', placeholder: '2028', type: 'number' },
    ],
  },
  {
    value: 'doctor',
    label: 'Doctor',
    caption: 'Your qualification, specialty and where you practise.',
    fields: [
      { key: 'qualification', label: 'Qualification', placeholder: 'MBBS, MD, MS, DNB…' },
      { key: 'specialty', label: 'Specialty', placeholder: 'Cardiology, Paediatrics…' },
      { key: 'designation', label: 'Current role', placeholder: 'Resident, Consultant, Registrar…' },
      { key: 'institution', label: 'Hospital / Clinic', placeholder: 'Where you practise' },
      { key: 'yearsExperience', label: 'Years of experience', placeholder: '6', type: 'number' },
    ],
  },
  {
    value: 'professor',
    label: 'Professor',
    caption: 'What you teach, and where.',
    fields: [
      { key: 'qualification', label: 'Highest qualification', placeholder: 'MD, PhD…' },
      { key: 'specialty', label: 'Department', placeholder: 'Anatomy, Pathology…' },
      { key: 'designation', label: 'Designation', placeholder: 'Assistant / Associate Professor, HOD…' },
      { key: 'institution', label: 'University / College', placeholder: 'Where you teach' },
      { key: 'yearsExperience', label: 'Years of teaching', placeholder: '12', type: 'number' },
    ],
  },
  {
    value: 'researcher',
    label: 'Researcher',
    caption: 'What you research, and where.',
    fields: [
      { key: 'qualification', label: 'Highest qualification', placeholder: 'PhD, MD, MSc…' },
      { key: 'specialty', label: 'Research area', placeholder: 'Oncology, genomics, public health…' },
      { key: 'designation', label: 'Current role', placeholder: 'Research Fellow, Scientist…' },
      { key: 'institution', label: 'Institution / Organisation', placeholder: 'Where you research' },
      { key: 'yearsExperience', label: 'Years in research', placeholder: '4', type: 'number' },
    ],
  },
  {
    value: 'other',
    label: 'Other',
    caption: 'Tell people what you do.',
    fields: [
      { key: 'designation', label: 'Role', placeholder: 'What you do' },
      { key: 'institution', label: 'Organisation', placeholder: 'Where you work' },
    ],
  },
];

/** Every field any profession can ask for — used when clearing on a switch. */
export const ALL_PROFILE_FIELD_KEYS: ProfileFieldKey[] = [
  'institution',
  'specialty',
  'qualification',
  'designation',
  'yearsExperience',
  'studyYear',
  'graduationYear',
];

export const getProfession = (value?: string | null): Profession | null =>
  PROFESSIONS.find((p) => p.value === value) ?? null;

export const getProfessionLabel = (value?: string | null): string | null =>
  getProfession(value)?.label ?? null;
