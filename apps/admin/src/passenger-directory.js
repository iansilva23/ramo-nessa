// Display only. Never replace the stable ID used by account actions or history.
export function passengerDisplayName(passenger) {
  return typeof passenger?.fullName === 'string' && passenger.fullName.trim()
    ? passenger.fullName.trim()
    : 'Nome não informado';
}
