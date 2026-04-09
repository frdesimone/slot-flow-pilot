import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/apiClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User as UserIcon, Upload, LogOut, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function UserMenu() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  if (!user) return null;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El logo debe pesar menos de 2MB");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch("/api/v1/auth/logo", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Error subiendo logo");
      }
      await refreshUser();
      toast.success("Logo actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error subiendo logo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const res = await apiFetch("/api/v1/auth/logo", { method: "DELETE" });
      if (!res.ok) throw new Error("Error eliminando logo");
      await refreshUser();
      toast.success("Logo eliminado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error eliminando logo");
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleFileChange}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors">
            <UserIcon className="w-4 h-4" />
            <span className="truncate">{user.username || "Usuario"}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="font-medium">{user.username}</span>
              {user.email && <span className="text-xs text-muted-foreground">{user.email}</span>}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleUploadClick} disabled={uploading}>
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? "Subiendo…" : user.has_logo ? "Cambiar logo" : "Subir logo"}
          </DropdownMenuItem>
          {user.has_logo && (
            <DropdownMenuItem onClick={handleRemoveLogo}>
              <Trash2 className="w-4 h-4 mr-2" />
              Quitar logo
            </DropdownMenuItem>
          )}
          {user.is_admin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/admin")}>
                <Shield className="w-4 h-4 mr-2" />
                Administración
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
