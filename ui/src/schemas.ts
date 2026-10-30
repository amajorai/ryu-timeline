import {
	timelineEventRecordSchema,
	timelineJournalRecordSchema,
} from "@ryu/app-host/rpc";
import { z } from "zod";
import type { JournalSnapshot, TimelineEvent } from "./types.ts";

const timelineListProjection = timelineEventRecordSchema.array().nullable();
export const timelineEventsSchema = z.custom<TimelineEvent[] | null>(
	(value) => timelineListProjection.safeParse(value).success
);
export const timelineJournalSchema =
	timelineJournalRecordSchema.nullable() satisfies z.ZodType<JournalSnapshot | null>;
export const timelineFrameSchema = z.string().nullable();
export const timelineFocusTimestampSchema = z.number().nullable().catch(null);
