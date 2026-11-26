import { Link } from 'react-router-dom';
import type { Trip } from '../api/trips';
import { copy } from '../copy';
import { formatCreatedDate } from '../format/date';

export interface TripListProps {
  /** Trips in the order the service returned them (F2.R5). The list does not re-sort. */
  trips: Trip[];
}

// One row per trip (F2.R5). Each row is a single link to the trip page, so its
// accessible name holds the trip name and the created date.
export function TripList({ trips }: TripListProps) {
  return (
    <ul>
      {trips.map((trip) => (
        <li key={trip.id}>
          <Link to={`/trips/${trip.id}`}>
            <span>{trip.name}</span>{' '}
            <span>{copy.tripCreated(formatCreatedDate(trip.createdAt))}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
