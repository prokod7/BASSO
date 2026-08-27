param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$FilePath
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void Send(string printerName, byte[] bytes) {
        IntPtr handle;
        if (!OpenPrinter(printerName, out handle, IntPtr.Zero))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Não foi possível abrir a impressora " + printerName);

        try {
            var docInfo = new DOCINFOA { pDocName = "PedidoPro", pDataType = "RAW" };
            if (!StartDocPrinter(handle, 1, docInfo))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Falha ao iniciar documento RAW");
            try {
                if (!StartPagePrinter(handle))
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Falha ao iniciar página RAW");
                try {
                    IntPtr unmanaged = Marshal.AllocCoTaskMem(bytes.Length);
                    try {
                        Marshal.Copy(bytes, 0, unmanaged, bytes.Length);
                        int written;
                        if (!WritePrinter(handle, unmanaged, bytes.Length, out written) || written != bytes.Length)
                            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Falha ao enviar bytes para a impressora");
                    } finally {
                        Marshal.FreeCoTaskMem(unmanaged);
                    }
                } finally {
                    EndPagePrinter(handle);
                }
            } finally {
                EndDocPrinter(handle);
            }
        } finally {
            ClosePrinter(handle);
        }
    }
}
'@

if (-not (Test-Path -LiteralPath $FilePath)) { throw "Arquivo de impressão não encontrado: $FilePath" }
$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $FilePath))
[RawPrinter]::Send($PrinterName, $bytes)
Write-Output "RAW enviado para $PrinterName ($($bytes.Length) bytes)"
