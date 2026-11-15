import Checkbox from '@/Components/Checkbox';
import InputError from '@/Components/InputError';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import TextInput from '@/Components/TextInput';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { DAYS } from '@/lib/days';
import { formatDuration, MINUTES_PER_DAY, toMinutes } from '@/lib/time';
import { Practitioner, ScheduleRow } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { ChangeEvent, FormEventHandler, useEffect } from 'react';

interface Props {
    practitioners: Practitioner[];
    practitioner: Practitioner | null;
    schedules: ScheduleRow[];
}

/** One weekday in the form. `working = false` means the day is switched off. */
interface DayState {
    dow: number;
    working: boolean;
    start_time: string;
    end_time: string;
}

const DEFAULT_START = '09:00';
const DEFAULT_END = '17:00';

// Shared by the axis row and every day row so the preview bars line up.
// label | time inputs | preview bar (stacked on phones)
const ROW_GRID = 'sm:grid-cols-[9rem_15rem_1fr]';

/** Seven entries in DAYS order; days that have a saved schedule start as working. */
function buildDays(schedules: ScheduleRow[]): DayState[] {
    return DAYS.map(({ dow }) => {
        const saved = schedules.find((s) => s.day_of_week === dow);
        return {
            dow,
            working: saved !== undefined,
            start_time: saved?.start_time ?? DEFAULT_START,
            end_time: saved?.end_time ?? DEFAULT_END,
        };
    });
}

/** Client-side check; the server stays the source of truth. */
function validateDay(day: DayState): string | null {
    if (!day.working) return null;

    const start = toMinutes(day.start_time);
    const end = toMinutes(day.end_time);

    if (start === null || end === null) return 'Enter both a start and an end time.';
    if (end <= start) return 'End time must be after the start time.';
    return null;
}

/** The working part of a day drawn on a 00:00-24:00 track. */
function DayBar({ day }: { day: DayState }) {
    const start = toMinutes(day.start_time);
    const end = toMinutes(day.end_time);
    const valid = day.working && start !== null && end !== null && end > start;

    return (
        <div aria-hidden="true" className="relative h-2 rounded-full bg-gray-100">
            {valid && (
                <div
                    className="absolute inset-y-0 rounded-full bg-indigo-500"
                    style={{
                        left: `${(start / MINUTES_PER_DAY) * 100}%`,
                        width: `${((end - start) / MINUTES_PER_DAY) * 100}%`,
                    }}
                />
            )}
        </div>
    );
}

function WeekForm({
    practitioner,
    schedules,
}: {
    practitioner: Practitioner;
    schedules: ScheduleRow[];
}) {
    const form = useForm<{ days: DayState[] }>({ days: buildDays(schedules) });
    const { days } = form.data;
    // Server errors are keyed "schedules.N.field"; useForm's types only know "days".
    const serverErrors = form.errors as Record<string, string | undefined>;

    // The server validates the list of WORKING days only, so "schedules.0" is the
    // first working day, not Monday. Rebuild the same list to map index -> day.
    const serverIndex = new Map<number, number>();
    days.filter((d) => d.working).forEach((d, i) => serverIndex.set(d.dow, i));

    const errorFor = (day: DayState): string | undefined => {
        const i = serverIndex.get(day.dow);
        return (
            validateDay(day) ??
            (i === undefined
                ? undefined
                : (serverErrors[`schedules.${i}.day_of_week`] ??
                  serverErrors[`schedules.${i}.start_time`] ??
                  serverErrors[`schedules.${i}.end_time`])) ??
            undefined
        );
    };

    const hasClientError = days.some((d) => validateDay(d) !== null);

    // Ask before a GET visit (changing practitioner, nav links) throws edits away.
    // Saving is a PUT, so it is never blocked.
    useEffect(() => {
        if (!form.isDirty) return;

        return router.on('before', (event) => {
            if (event.detail.visit.method !== 'get') return;
            return window.confirm(
                'You have unsaved schedule changes. Leave without saving?',
            );
        });
    }, [form.isDirty]);

    const updateDay = (dow: number, patch: Partial<DayState>) => {
        form.clearErrors();
        form.setData(
            'days',
            days.map((d) => (d.dow === dow ? { ...d, ...patch } : d)),
        );
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (hasClientError) return;

        // Send only the working days; the server deletes every day not in the list.
        form.transform((data) => ({
            schedules: data.days
                .filter((d) => d.working)
                .map(({ dow, start_time, end_time }) => ({
                    day_of_week: dow,
                    start_time,
                    end_time,
                })),
        }));
        form.put(route('schedules.update', practitioner.id), {
            preserveScroll: true,
            // The saved state is the new baseline: not dirty, Discard has nothing to undo.
            onSuccess: () => form.setDefaults(),
        });
    };

    const workingDays = days.filter((d) => d.working);
    const totalMinutes = workingDays.reduce((sum, d) => {
        const start = toMinutes(d.start_time);
        const end = toMinutes(d.end_time);
        return start !== null && end !== null && end > start
            ? sum + (end - start)
            : sum;
    }, 0);

    return (
        <form
            onSubmit={submit}
            noValidate
            className="overflow-hidden bg-white shadow-sm sm:rounded-lg"
        >
            <div
                aria-hidden="true"
                className={`hidden gap-x-4 px-6 pb-1 pt-4 text-xs text-gray-500 sm:grid ${ROW_GRID}`}
            >
                <span />
                <span />
                <div className="flex justify-between tabular-nums">
                    {['00', '06', '12', '18', '24'].map((h) => (
                        <span key={h}>{h}</span>
                    ))}
                </div>
            </div>

            <ul className="divide-y divide-gray-100">
                {days.map((day) => {
                    const label = DAYS.find((d) => d.dow === day.dow)!.label;
                    const error = errorFor(day);
                    const errorId = `day-${day.dow}-error`;
                    const timeProps = (field: 'start_time' | 'end_time') => ({
                        type: 'time' as const,
                        step: 300,
                        value: day[field],
                        onChange: (e: ChangeEvent<HTMLInputElement>) =>
                            updateDay(day.dow, { [field]: e.target.value }),
                        'aria-invalid': error ? true : undefined,
                        'aria-describedby': error ? errorId : undefined,
                        className:
                            'w-full py-1.5 text-sm tabular-nums sm:w-auto ' +
                            (error ? 'border-red-400' : ''),
                    });

                    return (
                        <li
                            key={day.dow}
                            className={`grid gap-x-4 gap-y-2 px-6 py-4 sm:items-center ${ROW_GRID}`}
                        >
                            <label
                                htmlFor={`working-${day.dow}`}
                                className="flex items-center gap-3 text-sm font-medium text-gray-900"
                            >
                                <Checkbox
                                    id={`working-${day.dow}`}
                                    checked={day.working}
                                    onChange={(e) =>
                                        updateDay(day.dow, {
                                            working: e.target.checked,
                                        })
                                    }
                                />
                                {label}
                            </label>

                            {day.working ? (
                                <div className="flex items-center gap-2">
                                    <TextInput
                                        aria-label={`${label} start time`}
                                        {...timeProps('start_time')}
                                    />
                                    <span aria-hidden="true" className="text-gray-400">
                                        –
                                    </span>
                                    <TextInput
                                        aria-label={`${label} end time`}
                                        {...timeProps('end_time')}
                                    />
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">Off</p>
                            )}

                            <DayBar day={day} />

                            {error && (
                                <InputError
                                    id={errorId}
                                    role="alert"
                                    message={error}
                                    className="sm:col-span-3"
                                />
                            )}
                        </li>
                    );
                })}
            </ul>

            <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm tabular-nums text-gray-600">
                    {workingDays.length === 0
                        ? 'No working days: no new bookings can be made.'
                        : `${workingDays.length} working ${
                              workingDays.length === 1 ? 'day' : 'days'
                          } · ${formatDuration(totalMinutes)} per week`}
                </p>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Always rendered so screen readers announce changes; empty:sr-only keeps it out of the layout (no stray gap). */}
                    <span
                        role="status"
                        className="text-sm text-gray-600 empty:sr-only"
                    >
                        {form.recentlySuccessful
                            ? 'Saved'
                            : hasClientError
                              ? 'Fix the highlighted times to save.'
                              : form.isDirty
                                ? 'Unsaved changes'
                                : ''}
                    </span>

                    <SecondaryButton
                        onClick={() => {
                            form.reset();
                            form.clearErrors();
                        }}
                        disabled={!form.isDirty || form.processing}
                    >
                        Discard
                    </SecondaryButton>
                    <PrimaryButton
                        type="submit"
                        disabled={
                            !form.isDirty || hasClientError || form.processing
                        }
                    >
                        {form.processing ? 'Saving…' : 'Save'}
                    </PrimaryButton>
                </div>
            </div>
        </form>
    );
}

export default function Edit({ practitioners, practitioner, schedules }: Props) {
    return (
        <AuthenticatedLayout
            header={
                <h2 className="text-xl font-semibold leading-tight text-gray-800">
                    Schedules
                    <span className="ml-2 text-sm font-normal text-gray-500">
                        Weekly working hours, repeated every week
                    </span>
                </h2>
            }
        >
            <Head title="Schedules" />

            <div className="py-12">
                <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6 lg:px-8">
                    {practitioner === null ? (
                        <section className="bg-white p-6 shadow-sm sm:rounded-lg">
                            <p className="text-sm text-gray-500">
                                No practitioners yet.
                            </p>
                        </section>
                    ) : (
                        <>
                            <div>
                                <label
                                    htmlFor="practitioner"
                                    className="block text-sm font-medium text-gray-700"
                                >
                                    Practitioner
                                </label>
                                <select
                                    id="practitioner"
                                    value={practitioner.id}
                                    onChange={(e) =>
                                        router.get(
                                            route('schedules.edit'),
                                            { practitioner: e.target.value },
                                            { preserveScroll: true },
                                        )
                                    }
                                    className="mt-2 w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:w-80"
                                >
                                    {practitioners.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.specialty
                                                ? `${p.name} · ${p.specialty}`
                                                : p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* key: remount on practitioner change so useForm re-initialises from the new props */}
                            <WeekForm
                                key={practitioner.id}
                                practitioner={practitioner}
                                schedules={schedules}
                            />
                        </>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
