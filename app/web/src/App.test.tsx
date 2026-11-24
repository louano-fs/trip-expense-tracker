import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from './App';

// This task proves no acceptance criterion. It is a smoke test that the root
// component renders. Named with the task ID, as the plan requires.
describe('F1.T1 root component', () => {
  afterEach(() => {
    cleanup();
  });

  it('F1.T1 renders the root component without error', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Trip Expense Tracker' })).toBeTruthy();
  });
});
