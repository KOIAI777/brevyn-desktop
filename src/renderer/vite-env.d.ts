/// <reference types="vite/client" />

import type { BrevynAPI } from "@/types/domain";

declare global {
  interface Window {
    brevyn: BrevynAPI;
  }
}
