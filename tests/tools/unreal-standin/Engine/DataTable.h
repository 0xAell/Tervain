// Stand-in for the DataTable: rows by name, found with their row struct's type.
#pragma once

#include "UObject/NameTypes.h"
#include "UObject/Object.h"

#include <map>
#include <string>

/** The base of every row struct. */
struct FTableRowBase
{
	virtual ~FTableRowBase() = default;
};

class UDataTable : public UObject
{
public:
	/** The row of that name as RowType, or null when there is none or it is of another type. */
	template <class RowType> RowType* FindRow(FName RowName, const TCHAR* ContextString, bool bWarnIfRowMissing) const
	{
		(void)ContextString; (void)bWarnIfRowMissing;
		const auto Found = Rows.find(RowName.StandInKey());
		return Found == Rows.end() ? nullptr : dynamic_cast<RowType*>(Found->second);
	}
	/** For tests: put a row in the table. */
	void StandInAddRow(const TCHAR* RowName, FTableRowBase* Row) { Rows[FName(RowName).StandInKey()] = Row; }
private:
	std::map<std::wstring, FTableRowBase*> Rows;
};
