import { supabase } from './supabase';

const FALLBACK_CALENDLY_URL = 'https://calendly.com/themarketinghaven01/30min';

export function getCalendlyUrl() {
  return import.meta.env.VITE_CALENDLY_URL?.trim() || FALLBACK_CALENDLY_URL;
}

export async function getAvailableSlots() {
  const { data, error } = await supabase
    .from('available_booking_slots')
    .select('slot_date, slot_time, is_available')
    .order('slot_date')
    .order('slot_time');

  if (error) return { success: false, slots: [], error };
  const byDate = (data || []).reduce((groups, slot) => {
    const date = slot.slot_date;
    const group = groups.find(item => item.date === date);
    if (group) group.slots.push(slot);
    else groups.push({ date, slots: [slot] });
    return groups;
  }, []);
  return { success: true, slots: byDate };
}

export async function createBooking({
  reviewId, fullName, email, whatsapp, brandName, bookedDate, bookedTime,
}) {
  const { data, error } = await supabase.from('strategy_call_bookings').insert({
    review_id: reviewId || null,
    full_name: fullName,
    email,
    whatsapp,
    brand_name: brandName || null,
    booked_date: bookedDate,
    booked_time: bookedTime,
  }).select('id').single();

  if (error) return { success: false, bookingId: null, error };

  // A confirmation failure must not undo an already confirmed booking.
  const { error: confirmationError } = await supabase.functions.invoke('send-booking-confirmation', {
    body: {
      bookingId: data.id,
      reviewId: reviewId || null,
      fullName,
      email,
      whatsapp,
      brandName: brandName || null,
      bookedDate,
      bookedTime,
    },
  });
  if (confirmationError) console.error('Booking confirmation could not be sent:', confirmationError);

  return { success: true, bookingId: data.id, confirmationError: confirmationError || null };
}
