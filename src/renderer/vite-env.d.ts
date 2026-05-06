/// <reference types="vite/client" />

import type { UclawAPI } from "@/types/domain";

declare global {
  interface Window {
    uclaw: UclawAPI;
  }
}
