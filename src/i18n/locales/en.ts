/**
 * LifeOS 2.0 — English translations
 * This is the source of truth for all UI strings.
 * All other locale files fall back to these values.
 */
const en = {
  // ─── Common ────────────────────────────────────────────────────────────────
  common: {
    save: 'Save',
    cancel: 'Cancel',
    back: 'Back',
    continue: 'Continue',
    done: 'Done',
    edit: 'Edit',
    delete: 'Delete',
    add: 'Add',
    close: 'Close',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    loading: 'Loading...',
    error: 'Something went wrong',
    retry: 'Try again',
    or: 'or',
    optional: 'optional',
    required: 'required',
    skip: 'Skip for now',
    comingSoon: 'Coming soon',
    today: 'Today',
    week: 'This Week',
    month: '30 Days',
  },

  // ─── Tab labels ─────────────────────────────────────────────────────────────
  tabs: {
    home: 'Home',
    plan: 'Plan',
    coach: 'Coach',
    focus: 'Focus',
    profile: 'Profile',
  },

  // ─── Home tab ───────────────────────────────────────────────────────────────
  home: {
    greeting_morning: 'Good morning',
    greeting_afternoon: 'Good afternoon',
    greeting_evening: 'Good evening',
    greeting_night: 'Good night',
    subtitle: "Here's your day",
    alignment_label: "Today's alignment",
    next_action_label: 'Next best action',
    no_next_action: 'No tasks scheduled yet',
    build_day_prompt: 'Build your day',
    daily_debrief_button: 'Daily Debrief',
    daily_debrief_done: 'Debrief saved',
    plan_summary_label: "Today's plan",
    no_plan_today: 'No plan generated yet',
    generate_plan: 'Generate my day',
    distraction_log: 'Log distraction',
    score_locked_in: 'Locked In',
    score_aligned: 'Aligned',
    score_building: 'Building',
    score_off_track: 'Off Track',
    active_focus: 'Focus session active',
    tap_to_view: 'Tap to view',
    nudge_start: 'Time to start',
    nudge_missed: 'Missed start',
    nudge_checkin: 'Check in',
    dismiss: 'Dismiss',
    snooze: 'Snooze 10 min',
  },

  // ─── Plan tab ───────────────────────────────────────────────────────────────
  plan: {
    title: 'Your Plan',
    segments: {
      today: 'Today',
      week: 'Week',
      month: '30-Day',
    },
    life_tracks: 'Life Tracks',
    friction_map: 'Friction Map',
    schedule_engine: 'Schedule',
    build_day: 'Build My Day',
    rebuild_week: 'Rebuild Week',
    reschedule: 'Reschedule Remaining',
    why_button: 'Why?',
    no_plan: 'No plan for today yet',
    no_tracks: 'No life tracks added yet',
    no_rules: 'No friction rules yet',
    no_events: 'No schedule events yet',
    add_track: 'Add Life Track',
    add_rule: 'Add friction rule',
    add_event: 'Add schedule event',
    critical_label: 'CRITICAL',
    energy_high: 'High energy',
    energy_medium: 'Medium energy',
    energy_low: 'Low energy',
    completed_label: 'Completed',
    item_notes_label: 'Why this time?',
    weekly_target: '{{hours}}h / week',
    priority_label: 'Priority {{n}}',
    deadline_label: 'Due {{date}}',
    sessions_label: '{{done}} / {{total}} sessions',
    monthly_target_label: '30-day target',
    schedule_event_days: 'Repeats on',
    import_schedule: 'Import from image',
    plan_type_daily: 'Daily Plan',
    plan_type_weekly: 'Weekly Plan',
  },

  // ─── Coach tab ──────────────────────────────────────────────────────────────
  coach: {
    title: 'Coach',
    placeholder: 'Ask your coach anything...',
    send: 'Send',
    clear_chat: 'Clear conversation',
    mode_local: 'Offline',
    mode_remote: 'AI (API key)',
    mode_label: 'Coach mode',
    quick_actions_label: 'Quick strategies',
    quick_actions: {
      build_day: 'Build my day',
      rebuild_week: 'Rebuild my week',
      recover_today: 'Recover today',
      reduce_distraction: 'Reduce distraction',
      improve_progress: 'Improve my progress',
    },
    thinking: 'Coach is thinking...',
    error: 'Coach unavailable right now',
    plan_generated: 'Plan generated',
    view_plan: 'View in Plan tab',
    no_api_key: 'Add your API key in Profile to use AI coach',
    you: 'You',
    coach_label: 'Coach',
  },

  // ─── Focus tab ──────────────────────────────────────────────────────────────
  focus: {
    title: 'Focus',
    start_session: 'Start Focus Session',
    active_label: 'Focus Active',
    end_session: 'End Session',
    pause_session: 'Pause',
    resume_session: 'Resume',
    duration_label: 'Duration',
    select_goal: 'What are you focusing on?',
    select_duration: 'Session length',
    duration_25: '25 min',
    duration_50: '50 min',
    duration_90: '90 min',
    duration_custom: 'Custom',
    log_distraction: 'Log Distraction',
    distraction_placeholder: 'What distracted you?',
    distraction_logged: 'Logged',
    session_complete: 'Session complete',
    session_duration: '{{mins}} minutes',
    sessions_today: '{{count}} session today',
    sessions_today_plural: '{{count}} sessions today',
    streak_label: 'Focus streak',
    streak_days: '{{count}} day',
    streak_days_plural: '{{count}} days',
    history_label: 'Session history',
    no_history: 'No sessions yet today',
    notes_placeholder: 'Session notes (optional)',
    goal_label: 'Life Track',
    add_notes: 'Add notes',
  },

  // ─── Profile tab ────────────────────────────────────────────────────────────
  profile: {
    title: 'Profile',
    identity_section: 'Identity',
    name_label: 'Name',
    life_role_label: 'Life Role',
    energy_style_label: 'Energy Style',
    work_style_label: 'Work Style',
    language_section: 'Language',
    language_label: 'App Language',
    language_restart_note: 'Restart the app after changing language for full effect',
    account_section: 'Account',
    sign_out: 'Sign Out',
    sign_out_confirm: 'Are you sure you want to sign out?',
    guest_mode: 'Guest Mode',
    logged_in_as: 'Logged in as',
    preferences_section: 'Preferences',
    api_key_label: 'Anthropic API Key',
    api_key_placeholder: 'sk-ant-...',
    api_key_hint: 'Required for AI coach mode. Never shared.',
    data_section: 'Data',
    export_data: 'Export My Data',
    reset_data: 'Reset All Data',
    reset_confirm: 'This will delete all your local data permanently. Are you sure?',
    version_label: 'Version',
    life_tracks_section: 'Life Tracks',
    manage_tracks: 'Manage Life Tracks',
    friction_map_section: 'Friction Map',
    manage_frictions: 'Manage Friction Rules',
    transformation_label: '12-Month Direction',
  },

  // ─── Onboarding ─────────────────────────────────────────────────────────────
  onboarding: {
    progress: 'Step {{current}} of {{total}}',
    continue: 'Continue',
    back: 'Back',
    finish: 'Start my LifeOS',

    step_language: {
      title: 'Choose your language',
      subtitle: 'You can change this anytime in Profile',
    },
    step_role: {
      title: "What's your life role?",
      subtitle: 'This shapes how your plan is built',
    },
    step_schedule: {
      title: 'Do you have fixed hours?',
      subtitle: 'Classes, shifts, work hours',
      has_schedule_yes: 'Yes, I have fixed hours',
      has_schedule_no: 'My schedule is flexible',
      start_label: 'From',
      end_label: 'To',
    },
    step_energy: {
      title: 'When are you most alive?',
      subtitle: 'We will schedule deep work for your peak hours',
    },
    step_work_style: {
      title: 'How do you work best?',
      subtitle: 'Be honest — we will build around this',
    },
    step_tracks: {
      title: 'What are you building?',
      subtitle: 'Choose up to 5 life tracks',
      custom_placeholder: 'Something else...',
      add_custom: 'Add custom',
    },
    step_frictions: {
      title: 'What gets in your way?',
      subtitle: 'Choose up to 3 main distractions',
    },
    step_direction: {
      title: 'Where are you going?',
      subtitle: 'In 12 months, I want to be...',
      direction_placeholder: 'Describe your 12-month vision...',
      chips_label: 'Choose what resonates',
    },
  },

  // ─── Life role options ───────────────────────────────────────────────────────
  lifeRoles: {
    student: 'Student',
    employee: 'Employee / Professional',
    freelancer: 'Freelancer / Self-employed',
    shift_worker: 'Shift Worker',
    creator: 'Creator / Artist',
    other: 'Other',
  },

  // ─── Energy style options ────────────────────────────────────────────────────
  energyStyles: {
    morning: 'Morning person',
    morning_desc: 'Best before 12:00',
    afternoon: 'Afternoon',
    afternoon_desc: 'Peak 12:00–17:00',
    evening: 'Evening',
    evening_desc: 'Peak 17:00–21:00',
    night: 'Night owl',
    night_desc: 'After 21:00',
    flexible: 'Flexible',
    flexible_desc: 'No strong preference',
  },

  // ─── Work style options ──────────────────────────────────────────────────────
  workStyles: {
    deep: 'Deep focus',
    deep_desc: '60–90 min sessions',
    balanced: 'Balanced',
    balanced_desc: '45 min sessions',
    short_bursts: 'Short bursts',
    short_bursts_desc: '20–25 min sessions',
  },

  // ─── Life track types ────────────────────────────────────────────────────────
  lifeTracks: {
    music: 'Music',
    coding: 'Coding',
    fitness: 'Fitness',
    language: 'Language Learning',
    reading: 'Reading',
    writing: 'Writing',
    career: 'Career',
    business: 'Business',
    health: 'Health',
    creative: 'Creativity',
    relationships: 'Relationships',
    mindfulness: 'Mindfulness',
    custom: 'Custom',
  },

  // ─── Friction types ───────────────────────────────────────────────────────────
  frictions: {
    phone: 'Phone / Notifications',
    social_media: 'Social Media',
    procrastination: 'Procrastination',
    noise: 'Noise / Environment',
    fatigue: 'Fatigue / Energy crashes',
    lack_of_clarity: 'Lack of clarity',
    people: 'People / Interruptions',
    overthinking: 'Overthinking',
  },

  // ─── Transformation directions ───────────────────────────────────────────────
  transformationDirections: {
    more_focused: 'More focused',
    healthier: 'Healthier',
    smarter: 'Smarter',
    financially_stronger: 'Financially stronger',
    more_creative: 'More creative',
    balanced: 'More balanced',
  },

  // ─── Auth screens ────────────────────────────────────────────────────────────
  auth: {
    login_title: 'Welcome back',
    login_subtitle: 'Sign in to your LifeOS',
    signup_title: 'Create your account',
    signup_subtitle: 'Start your transformation',
    email_label: 'Email',
    email_placeholder: 'you@example.com',
    password_label: 'Password',
    password_placeholder: 'Your password',
    login_button: 'Sign In',
    signup_button: 'Create Account',
    guest_button: 'Continue as Guest',
    switch_to_signup: "Don't have an account? Sign up",
    switch_to_login: 'Already have an account? Sign in',
    error_invalid: 'Invalid email or password',
    error_generic: 'Authentication failed. Please try again.',
    guest_note: 'Guest mode — data stored locally only',
  },

  // ─── Goal / LifeTrack categories (preserved for engine compatibility) ─────────
  goalCategories: {
    study: 'Study',
    skill: 'Skill',
    health: 'Health',
    life: 'Life',
    career: 'Career',
  },

  // ─── Rule types (Friction Map) ────────────────────────────────────────────────
  ruleTypes: {
    screen: 'Screen time',
    sleep: 'Sleep boundary',
    focus: 'Focus window',
    health: 'Health habit',
    social: 'Social limit',
    work: 'Work boundary',
    custom: 'Custom',
  },

  // ─── Language names ───────────────────────────────────────────────────────────
  languages: {
    en: 'English',
    ar: 'العربية',
    he: 'עברית',
  },
} as const;

export default en;
export type TranslationKeys = typeof en;
