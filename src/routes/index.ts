import { Router } from 'express';
import { authRoutes } from './auth.routes'
import { categoryRoutes } from './category.routes'
import { fieldsRoutes } from './field.routes'
import { userRoutes } from './user.routes'
import { teamRoutes } from './team.routes'
import { playerRoutes } from './player.routes'
import { tournamentRoutes } from './tournament.routes'
import { tournamentTeamRoutes } from './tournament_team.routes'
import { roundsRoutes } from './round.routes'
import { matchRoutes } from './match.routes'
import { matchesRoutes } from './match_event.routes'
import { standingsRoutes } from './standing.routes'
export const router = Router();

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/fields', fieldsRoutes);
router.use('/users', userRoutes);
router.use('/teams', teamRoutes)
router.use('/players', playerRoutes)
router.use('/tournaments', tournamentRoutes)
router.use('/tournaments', tournamentTeamRoutes)
router.use('/tournaments', roundsRoutes)
router.use('/tournaments', matchRoutes)
router.use('/matches', matchesRoutes)
router.use('/tournaments', standingsRoutes)