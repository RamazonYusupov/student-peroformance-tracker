export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "short_answer"
  | "paragraph";

export interface Question {
  id?: number;
  question_type: QuestionType;
  prompt: string;
  options?: string[] | null;
  correct_answer?: string | null;
  points: number;
  expected_length_hint?: string | null;
  min_word_count_hint?: number | null;
  order_index: number;
}

export interface TestEntity {
  id: string;
  title: string;
  description?: string | null;
  subject?: string | null;
  group_id?: string | null;
  group_ids?: string[];
  group?: GroupEntity | null;
  group_name?: string | null;
  group_names?: string[];
  start_at: string;
  end_at: string;
  randomize_question_order: boolean;
  passing_score: number;
  created_at?: string;
  questions?: Question[];
}

export interface SubmissionRow {
  submission_id: string;
  student_name: string;
  student_id?: string | null;
  score: number;
  total_points: number;
  percentage: number;
  status: "pass" | "fail" | "pending";
  violations: number;
  time_taken_seconds?: number | null;
  submitted_at?: string | null;
}

export interface DashboardSummary {
  total_tests: number;
  active_tests: number;
  total_submissions: number;
  pending_grading: number;
  recent_activity: SubmissionRow[];
}

export interface DashboardGroupTrendPoint {
  date: string;
  average_percentage: number;
  submission_count: number;
}

export interface DashboardGroupTrendResponse {
  group_id?: string | null;
  group_name: string;
  points: DashboardGroupTrendPoint[];
}

export interface SubmissionAnswerDetail {
  question_id: number;
  prompt: string;
  question_type: QuestionType;
  correct_answer?: string | null;
  student_answer?: string | null;
  is_correct?: boolean | null;
  awarded_points?: number | null;
  max_points: number;
  feedback?: string | null;
}

export interface SubmissionDetail {
  submission_id: string;
  test_id: string;
  student_name: string;
  student_id?: string | null;
  score: number;
  percentage: number;
  status: "pass" | "fail" | "pending";
  violations: number;
  answers: SubmissionAnswerDetail[];
}

export interface GradeAnswerPayload {
  question_id: number;
  is_correct?: boolean | null;
  awarded_points?: number | null;
  feedback?: string | null;
}

export interface StudentProfileRow {
  test_id: string;
  test_title: string;
  subject?: string | null;
  submitted_at?: string | null;
  score: number;
  percentage: number;
  status: "pass" | "fail" | "pending";
  violations: number;
  time_taken_seconds?: number | null;
}

export interface StudentProfile {
  student_name: string;
  total_tests_taken: number;
  average_score: number;
  pass_rate: number;
  total_violations: number;
  last_active?: string | null;
  history: StudentProfileRow[];
}

export interface GroupStudent {
  full_name: string;
  student_id: string;
}

export interface GroupEntity {
  id: string;
  name: string;
  students: GroupStudent[];
  created_at?: string;
}

export interface GroupStudentProfile {
  group_id: string;
  group_name: string;
  full_name: string;
  student_id: string;
  total_tests_taken: number;
  average_score: number;
  pass_rate: number;
  total_violations: number;
  last_active?: string | null;
  subjects: string[];
  history: StudentProfileRow[];
}

export interface GroupResultsPoint {
  date: string;
  average_percentage: number;
  submission_count: number;
}

export interface AnalyticsOverview {
  average_score: number;
  average_percentage: number;
  highest_score: number;
  lowest_score: number;
  score_distribution: Record<string, number>;
  question_difficulty: Array<Record<string, unknown>>;
  group_results_over_time: GroupResultsPoint[];
}
