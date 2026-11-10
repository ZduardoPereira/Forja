// FORJA Servidor: o "botão" do servidor no Windows.
//
//   FORJA.exe --perguntar   ao entrar no Windows: pergunta se liga o servidor
//   FORJA.exe               liga sem perguntar (menu Iniciar → "FORJA Servidor")
//
// Enquanto o servidor roda, fica um ícone perto do relógio: abrir o FORJA, copiar o convite para os
// amigos e desligar. Se o supervisor cair, liga de novo; ao sair do Windows, pede para ele desligar.
// Compilado por "npm run pc:install" com o compilador C# que já vem no Windows (.NET Framework 4).
// Outras opções: --pipe NOME e --node CAMINHO (passadas pela instalação), --resposta sim|nao e
// --captura ARQUIVO.png (testes: responde sem mostrar a pergunta / salva a imagem da pergunta).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Pipes;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("FORJA Servidor")]
[assembly: AssemblyDescription("FORJA Servidor")]
[assembly: AssemblyProduct("FORJA")]
[assembly: AssemblyCompany("FORJA")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace Forja
{
    static class Program
    {
        [DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();

        [STAThread]
        static int Main(string[] argv)
        {
            var args = new Args(argv);
            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            var server = new Server(Path.GetDirectoryName(Application.ExecutablePath), args.Get("--pipe"), args.Get("--node"));
            if (args.Get("--captura") != null) return AskForm.Snapshot(server, args.Get("--captura"));
            bool ask = args.Has("--perguntar");

            bool owner;
            var mutex = new Mutex(true, "Local\\FORJA-" + server.PipeName, out owner);
            if (!owner)
            {
                // Outra cópia aberta. Se o servidor já roda, é ela que mostra o ícone; senão ela está
                // saindo (ex.: atualização pelo pc:install) e esta assume quando ela terminar.
                if (server.Status() != null || !Acquire(mutex, 15000))
                {
                    if (!ask) MessageBox.Show("O FORJA Servidor já está aberto: procure o ícone dele perto do relógio.", "FORJA", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }
            }
            try
            {
                bool running = server.Status() != null;
                if (ask && !running)
                {
                    string answer = args.Get("--resposta");
                    bool yes;
                    if (answer != null) yes = answer == "sim";
                    else using (var form = new AskForm(server)) yes = form.ShowDialog() == DialogResult.Yes;
                    if (!yes) return 0;
                }
                Application.Run(new Tray(server, !running));
                return 0;
            }
            finally
            {
                try { mutex.ReleaseMutex(); } catch { }
                mutex.Dispose();
            }
        }

        static bool Acquire(Mutex mutex, int ms)
        {
            try { return mutex.WaitOne(ms); }
            catch (AbandonedMutexException) { return true; }
        }
    }

    sealed class Args
    {
        readonly string[] items;
        public Args(string[] items) { this.items = items; }
        public bool Has(string key) { return Array.IndexOf(items, key) >= 0; }
        public string Get(string key)
        {
            int i = Array.IndexOf(items, key);
            return i >= 0 && i + 1 < items.Length ? items[i + 1] : null;
        }
    }

    sealed class Status
    {
        public int SupervisorPid;
        public int ServerPid;
        public bool BackingUp;
    }

    /// Fala com o supervisor (tools/host/supervisor.mjs) e lê a configuração em forja.env.
    sealed class Server
    {
        public readonly string Home, App, PipeName, Node;

        public Server(string home, string pipe, string node)
        {
            Home = home;
            App = Path.Combine(home, "app");
            PipeName = string.IsNullOrEmpty(pipe) ? DefaultPipe(home) : pipe;
            Node = !string.IsNullOrEmpty(node) && File.Exists(node) ? node : "node.exe";
        }

        // Mesmo cálculo de tools/host/supervisor.mjs: sha1 do caminho da pasta, em minúsculas.
        static string DefaultPipe(string home)
        {
            string full = Path.GetFullPath(home).TrimEnd('\\').ToLowerInvariant();
            using (var sha = SHA1.Create())
            {
                var hex = new StringBuilder();
                foreach (byte b in sha.ComputeHash(Encoding.UTF8.GetBytes(full))) hex.Append(b.ToString("x2"));
                return "forja-" + hex.ToString().Substring(0, 10);
            }
        }

        string Value(string key)
        {
            try
            {
                foreach (string line in File.ReadAllLines(Path.Combine(Home, "forja.env")))
                {
                    var m = Regex.Match(line, @"^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$");
                    if (m.Success && m.Groups[1].Value == key) return m.Groups[2].Value.Trim('"');
                }
            }
            catch { }
            return null;
        }

        public string Port { get { string p = Value("PORT"); return string.IsNullOrEmpty(p) ? "3400" : p; } }
        public string LocalUrl { get { return "http://localhost:" + Port; } }
        public string PublicUrl
        {
            get
            {
                string u = Value("PUBLIC_URL");
                return u != null && u.StartsWith("https://") ? u.TrimEnd('/') : null;
            }
        }
        public string Invite { get { return Value("INVITE_CODE"); } }
        public bool HasApk { get { return File.Exists(Path.Combine(App, "web", "forja.apk")); } }

        public Process Start()
        {
            var psi = new ProcessStartInfo(Node, "\"" + Path.Combine(App, "supervisor.mjs") + "\"");
            psi.WorkingDirectory = App;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            return Process.Start(psi);
        }

        /// Manda um comando pelo pipe do supervisor; devolve a resposta (JSON) ou null.
        public string Send(string command, int timeoutMs)
        {
            var task = Task.Factory.StartNew<string>(() =>
            {
                try
                {
                    using (var pipe = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut))
                    {
                        pipe.Connect(Math.Min(timeoutMs, 2000));
                        byte[] bytes = Encoding.UTF8.GetBytes(command + "\n");
                        pipe.Write(bytes, 0, bytes.Length);
                        pipe.Flush();
                        using (var reader = new StreamReader(pipe, Encoding.UTF8)) return reader.ReadToEnd();
                    }
                }
                catch { return null; }
            });
            try { return task.Wait(timeoutMs) ? task.Result : null; }
            catch { return null; }
        }

        public Status Status()
        {
            string json = Send("status", 3000);
            if (json == null || !json.Contains("\"ok\":true")) return null;
            var st = new Status();
            st.SupervisorPid = Int(json, "supervisorPid");
            st.ServerPid = Int(json, "serverPid");
            st.BackingUp = json.Contains("\"backingUp\":true");
            return st;
        }

        static int Int(string json, string key)
        {
            var m = Regex.Match(json, "\"" + key + "\":(\\d+)");
            return m.Success ? int.Parse(m.Groups[1].Value) : 0;
        }

        public bool Healthy()
        {
            var task = Task.Factory.StartNew<bool>(() =>
            {
                try
                {
                    var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + Port + "/health");
                    req.Timeout = 2500;
                    req.Proxy = null;
                    using (var res = (HttpWebResponse)req.GetResponse()) return res.StatusCode == HttpStatusCode.OK;
                }
                catch { return false; }
            });
            try { return task.Wait(3000) && task.Result; }
            catch { return false; }
        }
    }

    /// A pergunta ao entrar no Windows.
    sealed class AskForm : Form
    {
        public AskForm(Server server)
        {
            Text = "FORJA";
            Icon = Icons.Get(32);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            TopMost = true;
            ShowInTaskbar = true;
            AutoScaleMode = AutoScaleMode.Dpi;
            AutoScaleDimensions = new SizeF(96F, 96F);
            Font = new Font("Segoe UI", 9.75F);
            BackColor = SystemColors.Window;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;

            var layout = new TableLayoutPanel();
            layout.ColumnCount = 1;
            layout.AutoSize = true;
            layout.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            layout.Dock = DockStyle.Fill;
            layout.Padding = new Padding(24, 20, 24, 18);

            var title = new Label();
            title.Text = "Ligar o servidor do FORJA?";
            title.Font = new Font("Segoe UI Semibold", 13F);
            title.AutoSize = true;
            title.Margin = new Padding(0, 0, 0, 10);

            string where = server.PublicUrl ?? "o endereço do grupo";
            var body = new Label();
            body.Text = "Com ele ligado, seus amigos entram no app por " + where + " enquanto este PC estiver ligado.\n\n" +
                        "Enquanto o servidor estiver ligado, o PC não entra em suspensão sozinho.";
            body.AutoSize = true;
            body.MaximumSize = new Size(420, 0);
            body.Margin = new Padding(0, 0, 0, 20);

            var buttons = new FlowLayoutPanel();
            buttons.FlowDirection = FlowDirection.RightToLeft;
            buttons.WrapContents = false;
            buttons.AutoSize = true;
            buttons.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            buttons.Dock = DockStyle.Fill;
            buttons.Margin = Padding.Empty;

            var no = new Button();
            no.Text = "Agora não";
            no.DialogResult = DialogResult.No;
            no.AutoSize = true;
            no.MinimumSize = new Size(104, 32);
            no.Margin = new Padding(10, 0, 0, 0);

            var yes = new Button();
            yes.Text = "Ligar";
            yes.DialogResult = DialogResult.Yes;
            yes.AutoSize = true;
            yes.MinimumSize = new Size(104, 32);
            yes.Margin = Padding.Empty;

            buttons.Controls.Add(no);  // da direita para a esquerda: [Ligar] [Agora não]
            buttons.Controls.Add(yes);
            yes.TabIndex = 0;          // Enter = Ligar; Esc = Agora não
            no.TabIndex = 1;
            buttons.TabIndex = 0;
            layout.Controls.Add(title, 0, 0);
            layout.Controls.Add(body, 0, 1);
            layout.Controls.Add(buttons, 0, 2);
            Controls.Add(layout);
            AcceptButton = yes;
            CancelButton = no;
            ActiveControl = yes;
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Activate();
        }

        /// Testes: desenha a pergunta fora da tela e salva num .png.
        public static int Snapshot(Server server, string file)
        {
            using (var form = new AskForm(server))
            {
                form.StartPosition = FormStartPosition.Manual;
                form.Location = new Point(-30000, -30000);
                form.ShowInTaskbar = false;
                form.Show();
                Application.DoEvents();
                using (var bmp = new Bitmap(form.Width, form.Height))
                {
                    form.DrawToBitmap(bmp, new Rectangle(0, 0, form.Width, form.Height));
                    bmp.Save(file, ImageFormat.Png);
                }
                form.Close();
            }
            return 0;
        }
    }

    /// O ícone perto do relógio enquanto o servidor roda.
    sealed class Tray : ApplicationContext
    {
        readonly Server server;
        readonly NotifyIcon icon;
        readonly System.Windows.Forms.Timer timer;
        Process proc;
        int watchPid;
        int ticks;
        bool stopping, announced, quitting, failed;
        DateTime stopAt;
        int crashes;
        DateTime crashWindow = DateTime.MinValue;

        public Tray(Server server, bool start)
        {
            this.server = server;
            icon = new NotifyIcon();
            icon.Icon = Icons.Get(SystemInformation.SmallIconSize.Width);
            icon.Text = "FORJA Servidor: ligando…";
            var menu = new ContextMenuStrip();
            var open = new ToolStripMenuItem("Abrir o FORJA", null, delegate { Open(); });
            open.Font = new Font(open.Font, FontStyle.Bold);
            menu.Items.Add(open);
            menu.Items.Add(new ToolStripMenuItem("Copiar convite para os amigos", null, delegate { CopyInvite(); }));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("Desligar o servidor", null, delegate { AskStop(); }));
            icon.ContextMenuStrip = menu;
            icon.DoubleClick += delegate { Open(); };
            icon.Visible = true;

            if (start) failed = !Launch();
            else
            {
                var st = server.Status();
                if (st != null) watchPid = st.SupervisorPid;
            }
            SystemEvents.SessionEnded += OnSessionEnded;
            timer = new System.Windows.Forms.Timer();
            timer.Interval = 500;
            timer.Tick += delegate { Tick(); };
            timer.Start();
        }

        bool Launch()
        {
            try
            {
                proc = server.Start();
                watchPid = proc.Id;
                return true;
            }
            catch (Exception e)
            {
                proc = null;
                watchPid = 0;
                MessageBox.Show("Não consegui ligar o servidor do FORJA:\n" + e.Message + "\n\nO Node.js está instalado?", "FORJA", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
        }

        void Tick()
        {
            if (failed) { failed = false; Quit(); return; }
            if (quitting) return;
            if (Exited()) { OnExit(); return; }
            if (stopping)
            {
                SetText("desligando…");
                if ((DateTime.Now - stopAt).TotalSeconds > 45 && proc != null) { try { proc.Kill(); } catch { } }
                return;
            }
            if (ticks++ % 6 != 0) return; // a cada ~3 s
            var st = server.Status();
            if (st != null && st.SupervisorPid > 0) watchPid = st.SupervisorPid;
            bool up = st != null && st.ServerPid > 0 && server.Healthy();
            SetText(st == null ? "ligando…" : st.BackingUp ? "fazendo o backup…" : up ? "no ar" : "ligando…");
            if (up && !announced)
            {
                announced = true;
                string url = server.PublicUrl;
                Balloon("FORJA no ar", url != null ? "Seus amigos já podem entrar: " + url : "Rodando em " + server.LocalUrl + " (ainda sem endereço na internet).", ToolTipIcon.Info);
            }
        }

        bool Exited()
        {
            try
            {
                if (proc != null) return proc.HasExited;
                if (watchPid > 0) using (var p = Process.GetProcessById(watchPid)) return p.HasExited;
                return true;
            }
            catch (ArgumentException) { return true; } // o processo não existe mais
            catch { return false; }
        }

        void OnExit()
        {
            int code = -1;
            try { if (proc != null) code = proc.ExitCode; } catch { }
            if (proc != null) { proc.Dispose(); proc = null; }
            watchPid = 0;
            if (stopping) { Quit(); return; }
            var st = server.Status(); // outro supervisor assumiu (ex.: npm run pc:start)?
            if (st != null) { watchPid = st.SupervisorPid; return; }
            if (code == 0 || code == -1) { Quit(); return; } // desligado de propósito (pc:stop, atualização)
            if (DateTime.Now - crashWindow > TimeSpan.FromMinutes(10)) { crashWindow = DateTime.Now; crashes = 0; }
            if (++crashes > 5)
            {
                quitting = true;
                Balloon("O servidor do FORJA parou", "Ele caiu várias vezes seguidas. Veja os logs com: npm run pc:logs", ToolTipIcon.Error);
                var later = new System.Windows.Forms.Timer();
                later.Interval = 10000;
                later.Tick += delegate { later.Stop(); Quit(); };
                later.Start();
                return;
            }
            announced = false;
            SetText("ligando de novo…");
            if (!Launch()) Quit();
        }

        void OnSessionEnded(object sender, SessionEndedEventArgs e)
        {
            // Saindo do Windows: pede para o servidor fechar o banco com calma.
            stopping = true;
            server.Send("stop", 4000);
            try
            {
                if (proc != null) proc.WaitForExit(5000);
                else if (watchPid > 0) using (var p = Process.GetProcessById(watchPid)) p.WaitForExit(5000);
            }
            catch { }
        }

        void Open()
        {
            try { Process.Start(new ProcessStartInfo(server.PublicUrl ?? server.LocalUrl) { UseShellExecute = true }); }
            catch { }
        }

        void CopyInvite()
        {
            string pub = server.PublicUrl;
            var text = new StringBuilder();
            text.AppendLine("Entra no FORJA: " + (pub ?? server.LocalUrl));
            if (!string.IsNullOrEmpty(server.Invite)) text.AppendLine("Código do grupo: " + server.Invite);
            if (pub != null && server.HasApk) text.AppendLine("App para Android: " + pub + "/forja.apk");
            try
            {
                Clipboard.SetText(text.ToString().TrimEnd());
                Balloon("Convite copiado", pub != null ? "É só colar no WhatsApp do grupo." : "Atenção: ainda não há endereço na internet (rode npm run pc:tunnel).", ToolTipIcon.Info);
            }
            catch { }
        }

        void AskStop()
        {
            var answer = MessageBox.Show(
                "Desligar o servidor do FORJA?\n\nSeus amigos ficam sem acesso até você ligar de novo (menu Iniciar → FORJA Servidor).",
                "FORJA", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
            if (answer != DialogResult.Yes || stopping) return;
            stopping = true;
            stopAt = DateTime.Now;
            SetText("desligando…");
            Task.Factory.StartNew(() => server.Send("stop", 30000));
        }

        void Balloon(string title, string text, ToolTipIcon kind)
        {
            try { icon.ShowBalloonTip(6000, title, text, kind); } catch { }
        }

        void SetText(string state)
        {
            string t = "FORJA Servidor: " + state;
            icon.Text = t.Length > 63 ? t.Substring(0, 63) : t;
        }

        void Quit()
        {
            quitting = true;
            if (timer != null) timer.Stop();
            SystemEvents.SessionEnded -= OnSessionEnded;
            icon.Visible = false;
            icon.Dispose();
            ExitThread();
        }
    }

    static class Icons
    {
        public static Icon Get(int size)
        {
            try
            {
                using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("forja.ico"))
                {
                    if (s != null) return new Icon(s, new Size(size, size));
                }
            }
            catch { }
            return SystemIcons.Application;
        }
    }
}
