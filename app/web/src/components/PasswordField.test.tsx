import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordField } from './PasswordField';

function renderField(value = '', onChange = vi.fn()) {
  render(
    <PasswordField
      id="password"
      label="Password"
      value={value}
      onChange={onChange}
      autoComplete="current-password"
    />,
  );
  return { onChange };
}

describe('F1 PasswordField', () => {
  afterEach(() => {
    cleanup();
  });

  it('F1.AC24 renders a labelled password input with the Show password button', () => {
    renderField();

    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('type')).toBe('password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('F1.AC24 "Show password" changes the input type to text and the label to Hide password', async () => {
    const user = userEvent.setup();
    renderField('my secret phrase here');

    await user.click(screen.getByRole('button', { name: 'Show password' }));

    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('text');
    const toggle = screen.getByRole('button', { name: 'Hide password' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('F1.AC24 "Hide password" changes the input type back to password', async () => {
    const user = userEvent.setup();
    renderField('my secret phrase here');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    await user.click(screen.getByRole('button', { name: 'Hide password' }));

    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy();
  });

  it('F1.AC24 does not block paste: the paste event is not prevented', () => {
    renderField();

    const notPrevented = fireEvent.paste(screen.getByLabelText('Password'), {
      clipboardData: { getData: () => 'my secret phrase here' },
    });

    expect(notPrevented).toBe(true);
  });

  it('F1.AC24 pasted text reaches the onChange handler', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField();

    await user.click(screen.getByLabelText('Password'));
    await user.paste('my secret phrase here');

    expect(onChange).toHaveBeenLastCalledWith('my secret phrase here');
  });

  // Not an AC: this checks the Accessibility rule that errors link to their field.
  it('F1 Accessibility: links the field to its error text with aria-describedby', () => {
    render(
      <PasswordField
        id="password"
        label="Password"
        value=""
        onChange={vi.fn()}
        autoComplete="current-password"
        describedBy="password-error"
        invalid
      />,
    );

    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('aria-describedby')).toBe('password-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});
