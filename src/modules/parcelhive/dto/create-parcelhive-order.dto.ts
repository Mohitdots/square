export type CreateParcelHiveOrderRequest = {
  integration_number: string;
  // client_uid: string;
  location_uid: string;
  // deposit_pin: string;
  // collect_pin: string;
  // starts_at: string;
  // ends_at: string;
  // service_pin: string;
  box_size: string;
  box_temperature: string;
  recipient_phone?: string;
  recipient_email?: string;
  webhook_url: string;
};

// Response shape not specified; keep flexible.
export type CreateParcelHiveOrderResponse = Record<string, any> & {
  id?: string;
  order_uid?: string;
  status?: string;
};
