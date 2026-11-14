export const guestEmail = id => `guest-${id}@guest.agromax.invalid`;
export const isGuestEmail = email => /^guest-[a-f0-9]{32}@guest\.agromax\.invalid$/.test(email);
