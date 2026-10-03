import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, setActiveProjectId } from "./api";
import { useAuth } from "./auth-context";

export type Project = {
  id: string;
  name: string;
  company_name: string;
  alamat?: string;
  active?: boolean;
};

type Ctx = {
  projects: Project[];
  activeId: string | null;
  activeProject: Project | null;
  setActive: (id: string) => void;
  reload: () => Promise<void>;
};

const ProjectContext = createContext<Ctx>({
  projects: [], activeId: null, activeProject: null, setActive: () => {}, reload: async () => {},
});

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setActiveId(null);
      setActiveProjectId(null);
      return;
    }
    try {
      const list = await api.listProjects();
      setProjects(list);
      setActiveId((cur) => {
        const keep = cur && list.find((p: Project) => p.id === cur) ? cur : (list[0]?.id ?? null);
        setActiveProjectId(keep);
        return keep;
      });
    } catch {
      // keep previous state
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    setActiveProjectId(id);
    qc.invalidateQueries();
  }, [qc]);

  const activeProject = projects.find((p) => p.id === activeId) ?? null;

  return (
    <ProjectContext.Provider value={{ projects, activeId, activeProject, setActive, reload }}>
      {children}
    </ProjectContext.Provider>
  );
}

export const useProject = () => useContext(ProjectContext);
