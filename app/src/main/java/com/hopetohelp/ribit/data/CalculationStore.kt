package com.hopetohelp.ribit.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import com.hopetohelp.ribit.domain.Calculation
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json

@Entity(tableName = "calculations")
data class SavedCalculation(
    @PrimaryKey val id: String,
    val title: String,
    val updatedAt: Long,
    val planCount: Int,
    val snapshot: String,
)

data class SavedSummary(
    val id: String,
    val title: String,
    val updatedAt: Long,
    val planCount: Int,
)

@Dao
interface CalculationDao {
    @Query("SELECT id, title, updatedAt, planCount FROM calculations ORDER BY updatedAt DESC, id")
    fun observeAll(): Flow<List<SavedSummary>>

    @Query("SELECT * FROM calculations WHERE id = :id")
    suspend fun find(id: String): SavedCalculation?

    @Upsert
    suspend fun save(calculation: SavedCalculation)

    @Query("DELETE FROM calculations WHERE id = :id")
    suspend fun remove(id: String): Int
}

@Database(entities = [SavedCalculation::class], version = 1)
abstract class RibitDatabase : RoomDatabase() {
    abstract fun calculations(): CalculationDao

    companion object {
        @Volatile
        private var instance: RibitDatabase? = null

        fun get(context: Context): RibitDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                RibitDatabase::class.java,
                "ribit.db",
            ).build().also { instance = it }
        }
    }
}

class CalculationStore(context: Context) {
    private val dao = RibitDatabase.get(context).calculations()
    private val json = Json { encodeDefaults = true }

    val summaries: Flow<List<SavedSummary>> = dao.observeAll()

    suspend fun save(id: String?, title: String, calculation: Calculation): String {
        val savedId = id ?: UUID.randomUUID().toString()
        dao.save(
            SavedCalculation(
                id = savedId,
                title = title,
                updatedAt = System.currentTimeMillis(),
                planCount = calculation.plans.size,
                snapshot = json.encodeToString(calculation),
            ),
        )
        return savedId
    }

    suspend fun load(id: String): Pair<String, Calculation>? {
        val entry = dao.find(id) ?: return null
        val calculation = json.decodeFromString<Calculation>(entry.snapshot)
        require(calculation.modelVersion == 1)
        return entry.title to calculation
    }

    suspend fun remove(id: String) {
        dao.remove(id)
    }
}
