// Stand-in for the DataTable: rows by name, found with their row struct's type.
#pragma once

#include "UObject/StandInObject.h"

/** The base of every row struct. */
struct FTableRowBase
{
	virtual ~FTableRowBase() = default;
};

class UDataTable : public UObject
{
public:
	/** The row of that name as RowType, or null when there is none or it is of another type. */
	template <class RowType> RowType* FindRow(FName RowName, const TCHAR* ContextString, bool bWarnIfRowMissing = true) const
	{
		(void)ContextString; (void)bWarnIfRowMissing;
		const auto Found = Rows.find(RowName.StandInValue());
		return Found == Rows.end() ? nullptr : dynamic_cast<RowType*>(Found->second);
	}
	/** For tests: put a row in the table. */
	void StandInAddRow(const TCHAR* RowName, FTableRowBase* Row) { Rows[RowName] = Row; }
private:
	std::map<std::string, FTableRowBase*> Rows;
};
