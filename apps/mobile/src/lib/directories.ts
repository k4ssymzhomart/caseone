import type { Directories, Employee, Equipment, FaultCode, Material } from '@rota/shared';
import { useQuery } from '@tanstack/react-query';

import { api } from './api';
import { qk } from './keys';

/** Every directory plus settings, cached for the session (PHASE_1 §5). */
export function useDirectories() {
  return useQuery({ queryKey: qk.directories, queryFn: () => api.directories.get(), staleTime: Infinity });
}

export interface DirectoryIndex {
  equipment: Map<number, Equipment>;
  materials: Map<number, Material>;
  faultCodes: Map<string, FaultCode>;
  employees: Map<string, Employee>;
}

export function indexDirectories(d: Directories): DirectoryIndex {
  return {
    equipment: new Map(d.equipment.map((e) => [e.id, e])),
    materials: new Map(d.materials.map((m) => [m.id, m])),
    faultCodes: new Map(d.fault_codes.map((f) => [f.code, f])),
    employees: new Map(d.employees.map((e) => [e.id, e])),
  };
}
