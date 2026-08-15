export type DeviceType = "desktop" | "tablet" | "waiter_smartpos" | "driver_phone" | "kds" | "other";

export interface RegisteredDeviceInput {
  deviceKey: string;
  deviceType: DeviceType;
  label: string;
  provider?: string;
  serial?: string;
  metadata?: Record<string, unknown>;
}
