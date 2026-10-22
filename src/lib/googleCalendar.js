// Reads the signed-in person's own Google Calendar for one day.
//
// Through the same Google connection as Client Orders (lib/orderForms/
// googleApi.js), so it stays connected until it's disconnected. Read-only by
// scope. The page calls Google itself with the access token: the Worker and
// Supabase never see an event.
import { GoogleError, connectGoogleWith, gfetch, googleHas, refreshGoogle } from "./orderForms/googleApi";

const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export const calendarConnected = () => googleHas(SCOPE);

// Whether the calendar can be read, asking the Worker if this page hasn't yet.
// false, not an error, when the Worker can't be reached: the button to connect
// is the way on either way.
export async function calendarReady() {
  if (calendarConnected()) return true;
  try {
    return (await refreshGoogle()) && calendarConnected();
  } catch {
    return false;
  }
}

// Off to Google's page when the calendar isn't part of the connection yet.
export const connectCalendar = () => connectGoogleWith(SCOPE);

// Every event touching the local day `date`, recurring ones as their own
// entries. Only the fields pickMeetings reads are asked for.
export async function fetchEventsForDay(date) {
  if (!(await calendarReady())) throw new GoogleError("signed-out");
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    fields: "items(id,summary,status,eventType,start,end,attendees(self,resource,responseStatus))",
  });
  return (await (await gfetch(`${EVENTS}?${params}`)).json()).items || [];
}
