// Stand-in for the read flags of HAL/FileManager.h, as Epic's API reference gives them (EFileRead).
#pragma once

enum EFileRead
{
	FILEREAD_None = 0x00,
	FILEREAD_NoFail = 0x01,
	FILEREAD_Silent = 0x02,
	FILEREAD_AllowWrite = 0x04,
};
