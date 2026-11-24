import { copy } from '../copy';

// Placeholder until F2 adds the trip list. No data is shown here.
export function Trips() {
  return (
    <section>
      <h2>{copy.tripsHeading}</h2>
      <p>{copy.tripsPlaceholder}</p>
    </section>
  );
}
