import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Clinic, Practitioner, TodayBooking, WeekSchedule } from '@/types';
import { Head } from '@inertiajs/react';
import { PropsWithChildren } from 'react';

const DAYS = [
    { dow: 1, label: 'Monday' },
    { dow: 2, label: 'Tuesday' },
    { dow: 3, label: 'Wednesday' },
    { dow: 4, label: 'Thursday' },
    { dow: 5, label: 'Friday' },
    { dow: 6, label: 'Saturday' },
    { dow: 0, label: 'Sunday' },
]; // Decision #4: Monday first

const STATUS_STYLES: Record<TodayBooking['status'], string> = {
    confirmed: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-600',
};

interface Props {
    clinic: Clinic;
    practitioners: Practitioner[];
    todayBookings: TodayBooking[];
    weekSchedules: WeekSchedule[];
    todayDow: number;
}

function Card({ title, children }: PropsWithChildren<{ title: string }>) {
    return (
        <section className="overflow-hidden bg-white shadow-sm sm:rounded-lg">
            <h3 className="border-b border-gray-100 px-6 py-4 text-lg font-medium text-gray-900">
                {title}
            </h3>
            <div className="p-6">{children}</div>
        </section>
    );
}

export default function Dashboard({
    clinic,
    practitioners,
    todayBookings,
    weekSchedules,
    todayDow,
}: Props) {
    return (
        <AuthenticatedLayout
            header={
                <h2 className="text-xl font-semibold leading-tight text-gray-800">
                    Dashboard
                    <span className="ml-2 text-sm font-normal text-gray-500">
                        {clinic.name} · {clinic.timezone}
                    </span>
                </h2>
            }
        >
            <Head title="Dashboard" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        <Card title={`Today's Bookings (${todayBookings.length})`}>
                            {todayBookings.length === 0 ? (
                                <p className="text-sm text-gray-500">No bookings today.</p>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {todayBookings.map((b) => (
                                        <li key={b.id} className="py-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="min-w-0 break-words text-sm text-gray-900">
                                                    <span className="font-semibold">{b.time}</span>
                                                    {' · '}
                                                    {b.patient_name}
                                                    {' — '}
                                                    {b.visit_reason}
                                                </p>
                                                <span
                                                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[b.status]}`}
                                                >
                                                    {b.status}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-xs text-gray-500">
                                                {b.practitioner}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>

                        <Card title="This Week's Schedule">
                            <ul className="space-y-2">
                                {DAYS.map(({ dow, label }) => {
                                    const rows = weekSchedules.filter(
                                        (s) => s.day_of_week === dow,
                                    );
                                    const isToday = dow === todayDow;
                                    return (
                                        <li
                                            key={dow}
                                            className={`rounded-md px-3 py-2 text-sm ${
                                                isToday
                                                    ? 'bg-indigo-50 ring-1 ring-indigo-200'
                                                    : ''
                                            }`}
                                        >
                                            <p
                                                className={`font-medium ${
                                                    isToday ? 'text-indigo-700' : 'text-gray-900'
                                                }`}
                                            >
                                                {label}
                                                {isToday && (
                                                    <span className="ml-2 text-xs font-normal">
                                                        (today)
                                                    </span>
                                                )}
                                            </p>
                                            {rows.length === 0 ? (
                                                <p className="text-gray-500">Off</p>
                                            ) : (
                                                rows.map((s) => (
                                                    <p key={s.id} className="text-gray-600">
                                                        {s.practitioner} {s.start_time}–{s.end_time}
                                                    </p>
                                                ))
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </Card>

                        <Card title={`Practitioners (${practitioners.length})`}>
                            {practitioners.length === 0 ? (
                                <p className="text-sm text-gray-500">No practitioners yet.</p>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {practitioners.map((p) => (
                                        <li key={p.id} className="py-3">
                                            <p className="text-sm font-medium text-gray-900">
                                                {p.name}
                                            </p>
                                            {p.specialty && (
                                                <p className="text-xs text-gray-500">
                                                    {p.specialty}
                                                </p>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
