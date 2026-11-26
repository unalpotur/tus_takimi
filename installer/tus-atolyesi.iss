#define AppVersion "1.0.0"
#ifndef NodeRuntime
  #define NodeRuntime "C:\Program Files\nodejs\node.exe"
#endif

[Setup]
AppId={{1DE9D6CE-1206-4A17-9998-B3A027C8D2DA}
AppName=Tuş Atölyesi
AppVersion={#AppVersion}
DefaultDirName={autopf}\Tus Atolyesi
DefaultGroupName=Tuş Atölyesi
DisableDirPage=yes
UsePreviousAppDir=no
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.10240
OutputDir=..\artifacts\installer
OutputBaseFilename=Tus-Atolyesi-Kurulum
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Tuş Atölyesi
CloseApplications=no
SetupLogging=yes

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Files]
Source: "{#NodeRuntime}"; DestDir: "{app}\releases\{code:ReleaseName}"; DestName: "node.exe"; Flags: ignoreversion
Source: "..\dist\server.cjs*"; DestDir: "{app}\releases\{code:ReleaseName}"; Flags: ignoreversion
Source: "..\dist\node-LICENSE.txt"; DestDir: "{app}\releases\{code:ReleaseName}"; Flags: ignoreversion
Source: "..\dist\third-party-notices.txt"; DestDir: "{app}\releases\{code:ReleaseName}"; Flags: ignoreversion
Source: "..\dist\*.trie"; DestDir: "{app}\releases\{code:ReleaseName}"; Flags: ignoreversion
Source: "..\dist\data\*.afm"; DestDir: "{app}\releases\{code:ReleaseName}\data"; Flags: ignoreversion
Source: "..\dist\data\*.icc"; DestDir: "{app}\releases\{code:ReleaseName}\data"; Flags: ignoreversion
Source: "..\dist\public\*"; DestDir: "{app}\releases\{code:ReleaseName}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "lan.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "admin.ps1"; DestDir: "{app}\releases\{code:ReleaseName}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Tuş Atölyesi"; Filename: "{code:LocalUrl}"
Name: "{group}\Kurulum parolası belirle"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\releases\{code:ReleaseName}\admin.ps1"""
Name: "{group}\Kurulum rehberi"; Filename: "{app}\README.md"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\releases\{code:ReleaseName}\admin.ps1"""; Description: "İlk öğretmen için kurulum parolası belirle"; Flags: postinstall skipifsilent unchecked runascurrentuser
Filename: "{code:LocalUrl}"; Description: "Tuş Atölyesi'ni tarayıcıda aç"; Flags: postinstall skipifsilent shellexec runasoriginaluser

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\lan.ps1"" -Uninstall"; Flags: runhidden; RunOnceId: "TusAtolyesiLan"

[Code]
var
  PortPage: TInputQueryWizardPage;
  SelectedPort: Integer;
  CurrentRelease: String;

function ReleaseName(const Param: String): String;
begin
  Result := CurrentRelease;
end;

function LocalUrl(const Param: String): String;
begin
  Result := 'http://localhost:' + IntToStr(SelectedPort);
end;

function ParsePort(const Value: String): Integer;
var
  I: Integer;
begin
  Result := 0;
  for I := 1 to Length(Value) do
    if (Value[I] < '0') or (Value[I] > '9') then
      Exit;
  Result := StrToIntDef(Value, 0);
  if (Result < 1) or (Result > 65535) then
    Result := 0;
end;

procedure InitializeWizard();
var
  Previous: TArrayOfString;
  Value: String;
begin
  CurrentRelease := GetDateTimeString('yyyymmddhhnnss', #0, #0);
  Value := '3000';
  if LoadStringsFromFile(ExpandConstant('{commonappdata}\TusAtolyesi\port.txt'), Previous) then
    if GetArrayLength(Previous) > 0 then
      if ParsePort(Trim(Previous[0])) > 0 then
        Value := Trim(Previous[0]);
  SelectedPort := ParsePort(Value);
  Value := ExpandConstant('{param:PORT|' + Value + '}');
  PortPage := CreateInputQueryPage(wpSelectDir, 'Yerel ağ ayarları', 'Uygulamanın dinleyeceği portu seçin',
    'Seçtiğiniz port için Windows Güvenlik Duvarı izni otomatik oluşturulur. İzin aynı alt ağdaki cihazların Tuş Atölyesi sunucusuna bağlanmasını sağlar.');
  PortPage.Add('TCP portu (1–65535)', False);
  PortPage.Values[0] := Value;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = PortPage.ID then
  begin
    SelectedPort := ParsePort(Trim(PortPage.Values[0]));
    Result := SelectedPort > 0;
    if not Result then
      MsgBox('1 ile 65535 arasında boş bir TCP portu girin.', mbError, MB_OK);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  SelectedPort := ParsePort(Trim(PortPage.Values[0]));
  Result := '';
  if SelectedPort = 0 then Result := 'TCP portu 1 ile 65535 arasında olmalıdır.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
  Params: String;
begin
  if CurStep = ssPostInstall then
  begin
    Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\lan.ps1') +
      '" -Port ' + IntToStr(SelectedPort) + ' -Release "' + ExpandConstant('{app}\releases\{code:ReleaseName}') + '"';
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Params, '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then
      RaiseException('Sunucu veya güvenlik duvarı yapılandırılamadı. Portun boş olduğunu kontrol edin. Ayrıntılar: ' +
        ExpandConstant('{commonappdata}\TusAtolyesi\setup.log'));
  end;
end;
