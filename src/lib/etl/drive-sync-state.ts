export type DriveSyncActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialDriveSyncState: DriveSyncActionState = {
  status: "idle",
  message: "",
};
