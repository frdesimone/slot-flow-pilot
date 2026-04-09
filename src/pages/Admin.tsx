import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiJson } from "@/lib/apiClient";
import { useAuth, AuthUser } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, KeyRound } from "lucide-react";
import { toast } from "sonner";

export default function Admin() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  // New user form
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<AuthUser | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [resetting, setResetting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await apiJson<AuthUser[]>("/api/v1/admin/users");
      setUsers(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error cargando usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleActive = async (u: AuthUser, nextValue: boolean) => {
    try {
      const updated = await apiJson<AuthUser>(
        `/api/v1/admin/users/${u.id}`,
        "PATCH",
        { is_active: nextValue },
      );
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      toast.success(`Usuario ${nextValue ? "habilitado" : "deshabilitado"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error actualizando usuario");
    }
  };

  const handleToggleAdmin = async (u: AuthUser, nextValue: boolean) => {
    try {
      const updated = await apiJson<AuthUser>(
        `/api/v1/admin/users/${u.id}`,
        "PATCH",
        { is_admin: nextValue },
      );
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
      toast.success(`Rol actualizado`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error actualizando rol");
    }
  };

  const openResetPassword = (u: AuthUser) => {
    setResetTarget(u);
    setResetPwd("");
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (resetPwd.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setResetting(true);
    try {
      await apiJson(`/api/v1/admin/users/${resetTarget.id}`, "PATCH", {
        password: resetPwd,
      });
      toast.success(`Contraseña de ${resetTarget.username} actualizada`);
      setResetTarget(null);
      setResetPwd("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error actualizando contraseña");
    } finally {
      setResetting(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUsername.trim() || newPassword.length < 6) {
      toast.error("Usuario y contraseña (mín. 6 caracteres) son requeridos");
      return;
    }
    setCreating(true);
    try {
      await apiJson("/api/v1/admin/users", "POST", {
        username: newUsername.trim(),
        password: newPassword,
        email: newEmail.trim() || null,
        is_admin: newIsAdmin,
      });
      toast.success("Usuario creado");
      setDialogOpen(false);
      setNewUsername("");
      setNewPassword("");
      setNewEmail("");
      setNewIsAdmin(false);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error creando usuario");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">Administración de usuarios</h1>
              <p className="text-sm text-muted-foreground">Crear, habilitar y deshabilitar cuentas</p>
            </div>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-1" />
                Nuevo usuario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear usuario</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="new-username">Usuario</Label>
                  <Input
                    id="new-username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="nombre_usuario"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">Contraseña (mín 6)</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-email">Email (opcional)</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="new-is-admin">Administrador</Label>
                  <Switch id="new-is-admin" checked={newIsAdmin} onCheckedChange={setNewIsAdmin} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateUser} disabled={creating}>
                  {creating ? "Creando…" : "Crear"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.username || u.id}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email || "-"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString("es-AR") : "-"}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={u.is_admin}
                          disabled={isSelf}
                          onCheckedChange={(v) => handleToggleAdmin(u, v)}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={u.is_active}
                          disabled={isSelf}
                          onCheckedChange={(v) => handleToggleActive(u, v)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openResetPassword(u)}
                        >
                          <KeyRound className="w-4 h-4 mr-1" />
                          Password
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Modal: Cambiar contraseña */}
        <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Cambiar contraseña — {resetTarget?.username}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="reset-pwd">Nueva contraseña (mín. 6)</Label>
                <Input
                  id="reset-pwd"
                  type="password"
                  value={resetPwd}
                  onChange={(e) => setResetPwd(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleResetPassword();
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetTarget(null)}>
                Cancelar
              </Button>
              <Button onClick={handleResetPassword} disabled={resetting}>
                {resetting ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
