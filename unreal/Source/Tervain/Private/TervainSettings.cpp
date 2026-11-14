#include "TervainSettings.h"

#include "Misc/Paths.h"

FString UTervainSettings::GetDataDirectory() const
{
	if (FPaths::IsRelative(DataDirectory))
	{
		return FPaths::ConvertRelativePathToFull(FPaths::Combine(FPaths::ProjectDir(), DataDirectory));
	}
	return DataDirectory;
}
