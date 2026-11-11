export interface User {
    id: number;
    name: string;
    email: string;
    email_verified_at?: string;
}

export type PageProps<
    T extends Record<string, unknown> = Record<string, unknown>,
> = T & {
    auth: {
        user: User;
    };
};

export interface Clinic {
    id: number;
    name: string;
    timezone: string;
}

export interface Practitioner {
    id: number;
    name: string;
    specialty: string | null;
}

export interface TodayBooking {
    id: number;
    time: string; // "10:00", clinic-local
    patient_name: string;
    visit_reason: string;
    status: 'confirmed' | 'completed' | 'cancelled';
    practitioner: string;
}

export interface WeekSchedule {
    id: number;
    day_of_week: number; // 0 = Sunday ... 6 = Saturday
    start_time: string; // "09:00"
    end_time: string;
    practitioner: string;
}